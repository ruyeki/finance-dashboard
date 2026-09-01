from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.models import AccountType
from app.security import AuthDep
from app.services import holdings

router = APIRouter(prefix="/stocks", tags=["stocks"], dependencies=[AuthDep])

_ACCOUNT_FILTERS = {
    "all": holdings.INVESTMENT_TYPES,
    "_401k": [AccountType._401k],
    "roth": [AccountType.roth],
    "brokerage": [AccountType.brokerage],
}


@router.get("")
def overview(session: Session = Depends(get_session)) -> dict:
    return holdings.stocks_overview(session)


@router.get("/history")
def history(
    account: str = "all",
    range: str = "6mo",
    session: Session = Depends(get_session),
) -> dict:
    """Portfolio value over time vs the S&P 500, filterable by account."""
    types = _ACCOUNT_FILTERS.get(account, holdings.INVESTMENT_TYPES)
    allowed_ranges = {"1mo", "3mo", "6mo", "1y", "ytd", "5y", "max"}
    rng = range if range in allowed_ranges else "6mo"
    return holdings.portfolio_history(session, types, rng)


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
