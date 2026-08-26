import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import Item
from app.security import AuthDep, encrypt
from app.services import plaid_client, plaid_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plaid", tags=["plaid"])


class ExchangeBody(BaseModel):
    public_token: str


@router.get("/status", dependencies=[AuthDep])
def status() -> dict:
    return {"configured": plaid_client.is_configured(), "env": None}


@router.post("/link-token", dependencies=[AuthDep])
def link_token() -> dict:
    if not plaid_client.is_configured():
        raise HTTPException(400, "Plaid is not configured (set PLAID_CLIENT_ID/SECRET).")
    try:
        return {"link_token": plaid_client.create_link_token()}
    except Exception as exc:  # noqa: BLE001
        logger.exception("link-token failed")
        raise HTTPException(502, f"Plaid link-token error: {exc}")


@router.post("/exchange", dependencies=[AuthDep])
def exchange(body: ExchangeBody, session: Session = Depends(get_session)) -> dict:
    try:
        access_token, item_id = plaid_client.exchange_public_token(body.public_token)
        institution = plaid_client.get_institution_name(access_token)
    except Exception as exc:  # noqa: BLE001
        logger.exception("exchange failed")
        raise HTTPException(502, f"Plaid exchange error: {exc}")

    existing = session.exec(select(Item).where(Item.plaid_item_id == item_id)).first()
    if existing:
        existing.access_token = encrypt(access_token)
        existing.institution_name = institution
        item = existing
    else:
        item = Item(
            plaid_item_id=item_id,
            institution_name=institution,
            access_token=encrypt(access_token),
        )
    session.add(item)
    session.commit()
    session.refresh(item)

    result = plaid_sync.sync_item(session, item)
    return {"item_id": item.id, "institution": institution, "sync": result}


@router.post("/sync", dependencies=[AuthDep])
def sync(session: Session = Depends(get_session)) -> dict:
    return plaid_sync.sync_all(session)


@router.post("/webhook")
async def webhook(request: Request, session: Session = Depends(get_session)) -> dict:
    """Plaid webhook. Triggers an incremental sync on transaction updates.

    Note: unauthenticated (Plaid calls it). In production, verify the JWT in
    the Plaid-Verification header; for local sandbox we accept and act only on
    known webhook types.
    """
    payload = await request.json()
    webhook_type = payload.get("webhook_type")
    webhook_code = payload.get("webhook_code")
    plaid_item_id = payload.get("item_id")

    if webhook_type == "TRANSACTIONS" and webhook_code in {
        "SYNC_UPDATES_AVAILABLE",
        "INITIAL_UPDATE",
        "DEFAULT_UPDATE",
    }:
        item = session.exec(
            select(Item).where(Item.plaid_item_id == plaid_item_id)
        ).first()
        if item:
            plaid_sync.sync_item(session, item)
    return {"received": True}
