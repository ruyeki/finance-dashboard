import datetime as dt
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from app.config import settings
from app.db import get_session
from app.models import Paycheck
from app.schemas import PaycheckCreate, PaycheckUpdate
from app.security import AuthDep
from app.services import gemini

router = APIRouter(prefix="/paychecks", tags=["paychecks"], dependencies=[AuthDep])


@router.get("")
def list_paychecks(session: Session = Depends(get_session)) -> list[Paycheck]:
    return session.exec(select(Paycheck).order_by(Paycheck.pay_date.desc())).all()


@router.post("/upload", response_model=Paycheck)
async def upload_paystub(
    file: UploadFile = File(...), session: Session = Depends(get_session)
) -> Paycheck:
    if not gemini.is_enabled():
        raise HTTPException(
            400,
            "GEMINI_API_KEY is not configured. Add it to parse paystubs, "
            "or add the paycheck manually.",
        )
    data = await file.read()

    os.makedirs(settings.upload_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}.pdf"
    path = os.path.join(settings.upload_dir, safe_name)
    with open(path, "wb") as f:
        f.write(data)

    try:
        parsed = gemini.parse_paystub(data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, f"Could not parse paystub: {exc}")

    def num(key: str) -> float:
        try:
            return float(parsed.get(key) or 0)
        except (TypeError, ValueError):
            return 0.0

    pay_date = dt.date.today()
    if parsed.get("pay_date"):
        try:
            pay_date = dt.date.fromisoformat(str(parsed["pay_date"]))
        except ValueError:
            pass

    paycheck = Paycheck(
        pay_date=pay_date,
        gross=num("gross"),
        federal_tax=num("federal_tax"),
        state_tax=num("state_tax"),
        social_security=num("social_security"),
        medicare=num("medicare"),
        insurance=num("insurance"),
        retirement_401k=num("retirement_401k"),
        net=num("net"),
        employer=parsed.get("employer"),
        source_pdf_path=path,
        parsed_by="ai",
    )
    session.add(paycheck)
    session.commit()
    session.refresh(paycheck)
    return paycheck


@router.post("/manual", response_model=Paycheck)
def create_manual_paycheck(
    body: PaycheckCreate, session: Session = Depends(get_session)
) -> Paycheck:
    paycheck = Paycheck(**body.model_dump(), parsed_by="manual")
    session.add(paycheck)
    session.commit()
    session.refresh(paycheck)
    return paycheck


@router.patch("/{paycheck_id}", response_model=Paycheck)
def update_paycheck(
    paycheck_id: int, body: PaycheckUpdate, session: Session = Depends(get_session)
) -> Paycheck:
    paycheck = session.get(Paycheck, paycheck_id)
    if not paycheck:
        raise HTTPException(404, "Paycheck not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(paycheck, field, value)
    paycheck.parsed_by = "manual"
    session.add(paycheck)
    session.commit()
    session.refresh(paycheck)
    return paycheck


@router.delete("/{paycheck_id}")
def delete_paycheck(paycheck_id: int, session: Session = Depends(get_session)) -> dict:
    paycheck = session.get(Paycheck, paycheck_id)
    if not paycheck:
        raise HTTPException(404, "Paycheck not found")
    session.delete(paycheck)
    session.commit()
    return {"message": "deleted"}
