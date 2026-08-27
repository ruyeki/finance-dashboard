import datetime as dt

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.security import AuthDep
from app.services import metrics, payperiods

router = APIRouter(prefix="/metrics", tags=["metrics"], dependencies=[AuthDep])


@router.get("/spending")
def spending(session: Session = Depends(get_session)) -> dict:
    return metrics.spending_summary(session, dt.date.today())


@router.get("/trend")
def trend(n: int = 8, session: Session = Depends(get_session)) -> list[dict]:
    return metrics.spending_trend(session, dt.date.today(), n)


@router.get("/balance-trends")
def balance_trends(session: Session = Depends(get_session)) -> list[dict]:
    return metrics.balance_trends(session)


@router.get("/networth")
def networth(session: Session = Depends(get_session)) -> dict:
    return metrics.net_worth(session)


@router.get("/networth-history")
def networth_history(days: int = 90, session: Session = Depends(get_session)) -> list[dict]:
    return metrics.networth_history(session, days)


@router.get("/assets")
def assets(session: Session = Depends(get_session)) -> dict:
    return metrics.asset_breakdown(session)


@router.get("/roth")
def roth(year: int | None = None, session: Session = Depends(get_session)) -> dict | None:
    year = year or dt.date.today().year
    return metrics.roth_progress(session, year)


@router.get("/sankey")
def sankey(
    start: dt.date | None = None,
    end: dt.date | None = None,
    session: Session = Depends(get_session),
) -> dict:
    if not start or not end:
        cadence, anchor = payperiods.get_pay_config(session)
        start, end = payperiods.period_for_date(dt.date.today(), cadence, anchor)
    return metrics.sankey(session, start, end)


@router.get("/flow")
def flow(session: Session = Depends(get_session)) -> dict:
    """Two-split money flow. Replaces /sankey, which mixed denominators and
    dropped the remainder so take-home never balanced."""
    return metrics.flow(session, dt.date.today())


@router.get("/recurring")
def recurring(session: Session = Depends(get_session)) -> dict:
    return metrics.recurring_charges(session, dt.date.today())
