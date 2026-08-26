"""Aggregation queries for dashboards: spending, trends, net worth, Sankey."""

import datetime as dt

from sqlalchemy import func
from sqlmodel import Session, select

from app.models import (
    Account,
    AccountType,
    BalanceSnapshot,
    ContributionGoal,
    Paycheck,
    Transaction,
)
from app.services import payperiods

# Categories that are not "spending".
NON_SPEND = {"Income", "Transfer", "Investments"}


def _spend_filter(query):
    return query.where(
        Transaction.amount > 0,
        Transaction.is_transfer == False,  # noqa: E712
        Transaction.is_income == False,  # noqa: E712
        Transaction.category.notin_(NON_SPEND),  # type: ignore[attr-defined]
    )


def spending_by_category(
    session: Session, start: dt.date, end: dt.date
) -> list[dict]:
    stmt = _spend_filter(
        select(Transaction.category, func.sum(Transaction.amount)).where(
            Transaction.date >= start, Transaction.date < end
        )
    ).group_by(Transaction.category)
    rows = session.exec(stmt).all()
    result = [{"category": c, "amount": round(float(a or 0), 2)} for c, a in rows]
    result.sort(key=lambda r: r["amount"], reverse=True)
    return result


def period_total_spend(session: Session, start: dt.date, end: dt.date) -> float:
    stmt = _spend_filter(
        select(func.sum(Transaction.amount)).where(
            Transaction.date >= start, Transaction.date < end
        )
    )
    return round(float(session.exec(stmt).one() or 0), 2)


def period_income(session: Session, start: dt.date, end: dt.date) -> float:
    stmt = select(func.sum(func.abs(Transaction.amount))).where(
        Transaction.date >= start,
        Transaction.date < end,
        Transaction.is_income == True,  # noqa: E712
    )
    return round(float(session.exec(stmt).one() or 0), 2)


def spending_summary(session: Session, today: dt.date) -> dict:
    cadence, anchor = payperiods.get_pay_config(session)
    start, end = payperiods.period_for_date(today, cadence, anchor)
    prev_start, prev_end = payperiods.previous_period(start, cadence, anchor)

    total = period_total_spend(session, start, end)
    prev_total = period_total_spend(session, prev_start, prev_end)

    periods = payperiods.recent_periods(today, cadence, anchor, 6)
    past_totals = [period_total_spend(session, s, e) for s, e in periods[1:]]
    avg = round(sum(past_totals) / len(past_totals), 2) if past_totals else 0.0

    return {
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "cadence": cadence,
        "total": total,
        "previous_total": prev_total,
        "delta": round(total - prev_total, 2),
        "average": avg,
        "by_category": spending_by_category(session, start, end),
        "income": period_income(session, start, end),
    }


def spending_trend(session: Session, today: dt.date, n: int = 8) -> list[dict]:
    cadence, anchor = payperiods.get_pay_config(session)
    periods = payperiods.recent_periods(today, cadence, anchor, n)
    out = [
        {
            "period_start": s.isoformat(),
            "period_end": e.isoformat(),
            "total": period_total_spend(session, s, e),
        }
        for s, e in reversed(periods)
    ]
    avg = round(sum(p["total"] for p in out) / len(out), 2) if out else 0.0
    for p in out:
        p["average"] = avg
    return out


def net_worth(session: Session) -> dict:
    # Convention: assets are stored positive, liabilities (credit/loans) negative.
    # SimpleFIN already signs this way; Plaid credit balances are negated at import.
    accounts = session.exec(select(Account)).all()
    by_type: dict[str, float] = {}
    total = 0.0
    for a in accounts:
        bal = a.current_balance
        by_type[a.type.value] = round(by_type.get(a.type.value, 0.0) + bal, 2)
        total += bal
    return {"total": round(total, 2), "by_type": by_type}


def roth_progress(session: Session, year: int) -> dict | None:
    goal = session.exec(
        select(ContributionGoal).where(
            ContributionGoal.account_type == AccountType.roth,
            ContributionGoal.year == year,
        )
    ).first()
    if not goal:
        return None
    pct = round(100 * goal.contributed_ytd / goal.limit, 1) if goal.limit else 0
    return {
        "year": year,
        "limit": goal.limit,
        "contributed_ytd": goal.contributed_ytd,
        "remaining": round(goal.limit - goal.contributed_ytd, 2),
        "percent": pct,
    }


def balance_trends(session: Session) -> list[dict]:
    """Per-account balance snapshot series, for value-over-time charts."""
    accounts = session.exec(select(Account).order_by(Account.name)).all()
    out: list[dict] = []
    for a in accounts:
        snaps = session.exec(
            select(BalanceSnapshot)
            .where(BalanceSnapshot.account_id == a.id)
            .order_by(BalanceSnapshot.date)
        ).all()
        if not snaps:
            continue
        out.append(
            {
                "account_id": a.id,
                "name": a.name,
                "type": a.type.value,
                "series": [
                    {"date": s.date.isoformat(), "balance": round(s.balance, 2)}
                    for s in snaps
                ],
            }
        )
    return out


def sankey(session: Session, start: dt.date, end: dt.date) -> dict:
    """Money flow: Paycheck -> deductions + Net; Net -> spending categories + Savings."""
    nodes: list[str] = []
    index: dict[str, int] = {}

    def node(name: str) -> int:
        if name not in index:
            index[name] = len(nodes)
            nodes.append(name)
        return index[name]

    links: list[dict] = []

    def link(src: str, dst: str, value: float):
        if value > 0:
            links.append({"source": node(src), "target": node(dst), "value": round(value, 2)})

    paychecks = session.exec(
        select(Paycheck).where(Paycheck.pay_date >= start, Paycheck.pay_date < end)
    ).all()

    gross = sum(p.gross for p in paychecks)
    net = sum(p.net for p in paychecks)
    if gross > 0:
        link("Paycheck", "Taxes", sum(p.federal_tax + p.state_tax + p.social_security + p.medicare for p in paychecks))
        link("Paycheck", "Insurance", sum(p.insurance for p in paychecks))
        link("Paycheck", "401(k)", sum(p.retirement_401k for p in paychecks))
        link("Paycheck", "Take-home", net)

    source_node = "Take-home" if gross > 0 else "Income"
    if gross <= 0:
        inc = period_income(session, start, end)
        if inc > 0:
            node(source_node)

    total_spend = 0.0
    for row in spending_by_category(session, start, end):
        link(source_node, row["category"], row["amount"])
        total_spend += row["amount"]

    return {"nodes": [{"name": n} for n in nodes], "links": links}
