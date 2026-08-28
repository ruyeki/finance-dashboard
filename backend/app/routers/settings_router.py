import datetime as dt

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import AccountType, ContributionGoal, Setting
from app.security import AuthDep

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[AuthDep])


class SettingsBody(BaseModel):
    pay_cadence: str | None = None
    pay_anchor: str | None = None
    income_keywords: str | None = None
    # Per-period discretionary allowance. Drives "discretionary left", which
    # otherwise silently falls back to a hardcoded default.
    discretionary_budget: float | None = None


class RothGoalBody(BaseModel):
    year: int
    limit: float
    contributed_ytd: float = 0.0


class GoalBody(RothGoalBody):
    # ContributionGoal was always generic over account type; only the endpoint
    # was not. The dashboard shows the 401(k) beside the Roth.
    account_type: AccountType = AccountType.roth


def _set(session: Session, key: str, value: str) -> None:
    row = session.get(Setting, key)
    if row:
        row.value = value
    else:
        row = Setting(key=key, value=value)
    session.add(row)


@router.get("")
def get_settings(session: Session = Depends(get_session)) -> dict:
    rows = session.exec(select(Setting)).all()
    return {r.key: r.value for r in rows}


@router.put("")
def update_settings(body: SettingsBody, session: Session = Depends(get_session)) -> dict:
    if body.pay_cadence is not None:
        _set(session, "pay_cadence", body.pay_cadence)
    if body.pay_anchor is not None:
        _set(session, "pay_anchor", body.pay_anchor)
    if body.income_keywords is not None:
        _set(session, "income_keywords", body.income_keywords)
    if body.discretionary_budget is not None:
        _set(session, "discretionary_budget", str(max(body.discretionary_budget, 0)))
    session.commit()
    return get_settings(session)


@router.put("/roth-goal", response_model=ContributionGoal)
def set_roth_goal(
    body: RothGoalBody, session: Session = Depends(get_session)
) -> ContributionGoal:
    goal = session.exec(
        select(ContributionGoal).where(
            ContributionGoal.account_type == AccountType.roth,
            ContributionGoal.year == body.year,
        )
    ).first()
    if goal:
        goal.limit = body.limit
        goal.contributed_ytd = body.contributed_ytd
    else:
        goal = ContributionGoal(
            account_type=AccountType.roth,
            year=body.year,
            limit=body.limit,
            contributed_ytd=body.contributed_ytd,
        )
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return goal


def _upsert_goal(
    session: Session, account_type: AccountType, year: int, limit: float, ytd: float
) -> ContributionGoal:
    goal = session.exec(
        select(ContributionGoal).where(
            ContributionGoal.account_type == account_type,
            ContributionGoal.year == year,
        )
    ).first()
    if goal:
        goal.limit = limit
        goal.contributed_ytd = ytd
    else:
        goal = ContributionGoal(
            account_type=account_type, year=year, limit=limit, contributed_ytd=ytd
        )
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return goal


@router.put("/goal", response_model=ContributionGoal)
def set_goal(body: GoalBody, session: Session = Depends(get_session)) -> ContributionGoal:
    """Set a contribution goal for any account type."""
    return _upsert_goal(
        session, body.account_type, body.year, body.limit, body.contributed_ytd
    )
