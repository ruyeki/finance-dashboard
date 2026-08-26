import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import Item
from app.security import AuthDep, encrypt
from app.services import simplefin_client, simplefin_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/simplefin", tags=["simplefin"], dependencies=[AuthDep])

SIMPLEFIN_ITEM_KEY = "simplefin"


class SetupBody(BaseModel):
    setup_token: str


@router.get("/status")
def status(session: Session = Depends(get_session)) -> dict:
    item = session.exec(
        select(Item).where(Item.provider == "simplefin")
    ).first()
    return {
        "connected": item is not None,
        "last_synced_at": item.last_synced_at.isoformat()
        if item and item.last_synced_at
        else None,
    }


@router.post("/setup")
def setup(body: SetupBody, session: Session = Depends(get_session)) -> dict:
    try:
        access_url = simplefin_client.claim_setup_token(body.setup_token)
    except Exception as exc:  # noqa: BLE001
        logger.exception("SimpleFIN claim failed")
        raise HTTPException(
            400,
            "Could not claim that SimpleFIN setup token. It may be expired or "
            f"already used. ({exc})",
        )

    item = session.exec(select(Item).where(Item.provider == "simplefin")).first()
    if item:
        item.access_token = encrypt(access_url)
    else:
        item = Item(
            provider="simplefin",
            plaid_item_id=SIMPLEFIN_ITEM_KEY,
            institution_name="SimpleFIN",
            access_token=encrypt(access_url),
        )
    session.add(item)
    session.commit()
    session.refresh(item)

    result = simplefin_sync.sync_item(session, item)
    return {"connected": True, "sync": result}
