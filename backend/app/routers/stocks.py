from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.security import AuthDep
from app.services import holdings

router = APIRouter(prefix="/stocks", tags=["stocks"], dependencies=[AuthDep])


@router.get("")
def overview(session: Session = Depends(get_session)) -> dict:
    return holdings.stocks_overview(session)


@router.post("/refresh")
def refresh(session: Session = Depends(get_session)) -> dict:
    """Reprice all investment holdings from live market data now."""
    return holdings.revalue(session)


@router.post("/seed-401k")
def seed_401k(session: Session = Depends(get_session)) -> dict:
    """(Re)create the Guideline 401k from configured fund values."""
    result = holdings.seed_401k(session)
    holdings.revalue(session)
    return result
