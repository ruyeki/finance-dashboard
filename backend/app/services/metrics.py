"""Aggregation queries for dashboards: spending, trends, net worth, Sankey."""

import datetime as dt
import statistics

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
from app.categories import (
    DISCRETIONARY,
    ESSENTIAL,
    EXCLUDED,
    FIXED,
    TIER_LABELS,
    tier_for,
)
from app.services import payperiods

# Categories that are not "spending".
NON_SPEND = {"Income", "Transfer", "Investments"}

# Only these account types are spending sources. Investment/retirement accounts
# (brokerage/roth/401k) and savings are excluded — buying securities, contributions,
# and savings transfers are not "spending".
SPENDING_ACCOUNT_TYPES = [AccountType.checking, AccountType.credit, AccountType.other]


def _spending_account_ids():
    return select(Account.id).where(Account.type.in_(SPENDING_ACCOUNT_TYPES))


def _spend_filter(query):
    # Exclusion is flag-based only (is_transfer = card payoffs / manual; is_income),
    # so anything else — ATM, Zelle, bank payments — counts as spending.
    return query.where(
        Transaction.amount > 0,
        Transaction.is_transfer == False,  # noqa: E712
        Transaction.is_income == False,  # noqa: E712
        Transaction.account_id.in_(_spending_account_ids()),  # type: ignore[attr-defined]
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


# Friendly labels for grouping spending by the account it came from.
SOURCE_LABELS = {
    AccountType.credit: "Credit card",
    AccountType.checking: "Debit / Checking",
    AccountType.brokerage: "Investments",
    AccountType.roth: "Investments",
    AccountType._401k: "Investments",
    AccountType.savings: "Savings",
    AccountType.other: "Other",
}


def spending_by_source(session: Session, start: dt.date, end: dt.date) -> list[dict]:
    """Group outflows by the account they came from (credit card / debit /
    investments / savings). Excludes transfers and income."""
    stmt = (
        select(Account.type, func.sum(Transaction.amount), func.count(Transaction.id))
        .select_from(Transaction)
        .join(Account, Transaction.account_id == Account.id)
        .where(
            Transaction.amount > 0,
            Transaction.is_transfer == False,  # noqa: E712
            Transaction.is_income == False,  # noqa: E712
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Account.type)
    )
    agg: dict[str, dict] = {}
    for atype, amt, cnt in session.exec(stmt).all():
        label = SOURCE_LABELS.get(atype, "Other")
        row = agg.setdefault(label, {"source": label, "amount": 0.0, "count": 0})
        row["amount"] += float(amt or 0)
        row["count"] += int(cnt)
    out = list(agg.values())
    for o in out:
        o["amount"] = round(o["amount"], 2)
    out.sort(key=lambda r: r["amount"], reverse=True)
    return out


def top_merchants(
    session: Session, start: dt.date, end: dt.date, limit: int = 8
) -> list[dict]:
    stmt = _spend_filter(
        select(
            func.coalesce(Transaction.merchant_name, Transaction.raw_name),
            func.sum(Transaction.amount),
            func.count(Transaction.id),
        ).where(Transaction.date >= start, Transaction.date < end)
    ).group_by(func.coalesce(Transaction.merchant_name, Transaction.raw_name))
    rows = session.exec(stmt).all()
    out = [
        {"merchant": m or "Unknown", "amount": round(float(a or 0), 2), "count": int(c)}
        for m, a, c in rows
    ]
    out.sort(key=lambda r: r["amount"], reverse=True)
    return out[:limit]


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
        Transaction.account_id.in_(_spending_account_ids()),  # type: ignore[attr-defined]
    )
    return round(float(session.exec(stmt).one() or 0), 2)


def spending_summary(session: Session, today: dt.date) -> dict:
    cadence, anchor = payperiods.get_pay_config(session)
    start, end = payperiods.period_for_date(today, cadence, anchor)
    prev_start, prev_end = payperiods.previous_period(start, cadence, anchor)

    total = period_total_spend(session, start, end)
    prev_total = period_total_spend(session, prev_start, prev_end)

    # Six *complete* prior periods. This previously asked for 6 and then
    # dropped the current one, averaging five while calling it a six-period
    # average -- the figure the whole redesign compares against.
    prior = past_periods(session, today, 6)
    past_totals = [period_total_spend(session, s, e) for s, e in prior]
    avg = round(sum(past_totals) / len(past_totals), 2) if past_totals else 0.0

    income = period_income(session, start, end)
    days_total = max((end - start).days, 1)
    days_elapsed = min(max((today - start).days + 1, 1), days_total)
    daily_avg = round(total / days_elapsed, 2)
    projected = round(daily_avg * days_total, 2)
    savings_rate = round(100 * (income - total) / income, 1) if income > 0 else None

    by_cat = spending_by_category(session, start, end)
    by_tier = tier_breakdown(by_cat)
    cat_avgs = category_averages(session, today, 6, to_day=days_elapsed)
    tier_avgs = tier_breakdown(
        [{"category": c, "amount": a} for c, a in cat_avgs.items()]
    )
    budget = discretionary_budget(session)
    disc_spent = by_tier[DISCRETIONARY]

    # The redesign's headline measure: the share of gross that stays yours --
    # 401(k) plus whatever cash survived. Displayed as "savings rate".
    pay = paycheck_totals(session, start, end)
    keep_rate = (
        round(100 * (pay["k401"] + (pay["net"] - total)) / pay["gross"], 1)
        if pay["gross"] > 0
        else None
    )

    return {
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "cadence": cadence,
        "total": total,
        "previous_total": prev_total,
        "delta": round(total - prev_total, 2),
        "average": avg,
        "by_category": by_cat,
        "income": income,
        "days_elapsed": days_elapsed,
        "days_total": days_total,
        "daily_avg": daily_avg,
        "projected": projected,
        "savings_rate": savings_rate,
        "net_cash_flow": round(income - total, 2),
        "top_category": by_cat[0]["category"] if by_cat else None,
        "top_merchants": top_merchants(session, start, end, 8),
        "by_source": spending_by_source(session, start, end),
        "by_tier": by_tier,
        "category_averages": cat_avgs,
        "tier_averages": tier_avgs,
        "discretionary_budget": budget,
        "discretionary_spent": disc_spent,
        "discretionary_left": round(budget - disc_spent, 2),
        "keep_rate": keep_rate,
        "gross": pay["gross"],
        "take_home": pay["net"],
    }


def networth_history(session: Session, days: int = 90) -> list[dict]:
    """Reconstruct daily net worth from current balances + transaction flows.

    net_worth(D) = current_total + sum(amount for txns dated after D)
    (amount>0 is an outflow, so adding flows after D "rewinds" to that day).
    Cash accounts are exact; investment market moves aren't captured until real
    daily snapshots accumulate.
    """
    total_current = round(
        sum(a.current_balance for a in session.exec(select(Account)).all()), 2
    )
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    rows = session.exec(
        select(Transaction.date, Transaction.amount).where(Transaction.date > start)
    ).all()
    day_flow: dict[dt.date, float] = {}
    for d, a in rows:
        day_flow[d] = day_flow.get(d, 0.0) + a

    points: list[dict] = []
    running = 0.0  # sum of amounts for txns dated strictly after the current day
    d = end
    while d >= start:
        points.append({"date": d.isoformat(), "net_worth": round(total_current + running, 2)})
        running += day_flow.get(d, 0.0)
        d -= dt.timedelta(days=1)
    points.reverse()
    return points


def asset_breakdown(session: Session) -> dict:
    """Cash vs. invested vs. debt, for context cards."""
    cash = invested = debt = 0.0
    for a in session.exec(select(Account)).all():
        if a.type in (AccountType.checking, AccountType.savings):
            cash += a.current_balance
        elif a.type in (AccountType.brokerage, AccountType.roth, AccountType._401k):
            invested += a.current_balance
        elif a.type == AccountType.credit:
            debt += a.current_balance  # already negative
        else:
            cash += a.current_balance
    return {
        "cash": round(cash, 2),
        "invested": round(invested, 2),
        "debt": round(debt, 2),
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


# --- Tiers, averages, and the two-split flow --------------------------------


def past_periods(
    session: Session, today: dt.date, n: int = 6
) -> list[tuple[dt.date, dt.date]]:
    """The `n` complete periods *before* the one containing `today`."""
    cadence, anchor = payperiods.get_pay_config(session)
    return payperiods.recent_periods(today, cadence, anchor, n + 1)[1:]


def tier_breakdown(by_category: list[dict]) -> dict[str, float]:
    """Fold a category breakdown into tier totals.

    Excluded categories are kept under `excluded` rather than dropped, so a
    caller can still reconcile the parts against the whole.
    """
    out = {FIXED: 0.0, ESSENTIAL: 0.0, DISCRETIONARY: 0.0, EXCLUDED: 0.0}
    for row in by_category:
        out[tier_for(row["category"])] += row["amount"]
    return {k: round(v, 2) for k, v in out.items()}


def category_averages(
    session: Session, today: dt.date, n: int = 6, to_day: int | None = None
) -> dict[str, float]:
    """Per-category average over the `n` complete periods before this one.

    `to_day` truncates each past period to its first N days. Mid-period that is
    the only honest comparison: day 11 against day 11, not day 11 against a
    finished period.
    """
    periods = past_periods(session, today, n)
    if not periods:
        return {}
    totals: dict[str, float] = {}
    for start, end in periods:
        stop = min(start + dt.timedelta(days=to_day), end) if to_day else end
        for row in spending_by_category(session, start, stop):
            totals[row["category"]] = totals.get(row["category"], 0.0) + row["amount"]
    return {c: round(v / len(periods), 2) for c, v in totals.items()}


def tier_averages(
    session: Session, today: dt.date, n: int = 6, to_day: int | None = None
) -> dict[str, float]:
    avgs = category_averages(session, today, n, to_day)
    return tier_breakdown([{"category": c, "amount": a} for c, a in avgs.items()])


def discretionary_budget(session: Session) -> float:
    """Per-period discretionary allowance. A single user-set number."""
    raw = payperiods.get_setting(session, "discretionary_budget", "600")
    try:
        return max(float(raw), 0.0)
    except ValueError:
        return 600.0


def recurring_charges(
    session: Session, today: dt.date, lookback_days: int = 190, min_hits: int = 3
) -> dict:
    """Charges that repeat monthly at a stable amount.

    Deliberately conservative: a merchant qualifies only with at least
    `min_hits` charges, a median gap in the monthly range, and an amount that
    barely moves. A merchant you merely visit every month has a swinging
    amount and is rejected.
    """
    start = today - dt.timedelta(days=lookback_days)
    stmt = _spend_filter(
        select(
            Transaction.merchant_name,
            Transaction.date,
            Transaction.amount,
            Transaction.category,
        ).where(Transaction.date >= start, Transaction.date < today)
    )
    groups: dict[str, list[tuple[dt.date, float, str]]] = {}
    for name, date, amount, category in session.exec(stmt).all():
        key = (name or "").strip()
        if key:
            groups.setdefault(key, []).append((date, float(amount), category))

    items: list[dict] = []
    for name, hits in groups.items():
        if len(hits) < min_hits:
            continue
        hits.sort(key=lambda h: h[0])
        gaps = [(hits[i][0] - hits[i - 1][0]).days for i in range(1, len(hits))]
        if not gaps or not 24 <= statistics.median(gaps) <= 38:
            continue
        amounts = [h[1] for h in hits]
        typical = statistics.median(amounts)
        if typical <= 0 or (max(amounts) - min(amounts)) > 0.25 * typical:
            continue
        items.append(
            {
                "merchant": name,
                "amount": round(typical, 2),
                "category": hits[-1][2],
                "cadence": "monthly",
                "last_date": hits[-1][0].isoformat(),
                "hits": len(hits),
            }
        )

    items.sort(key=lambda i: i["amount"], reverse=True)
    monthly = round(sum(i["amount"] for i in items), 2)
    return {
        "monthly_total": monthly,
        "annual_total": round(monthly * 12, 2),
        "items": items,
    }


def paycheck_totals(session: Session, start: dt.date, end: dt.date) -> dict:
    """Paycheck components for a period. Gross, net and 401(k) drive the keep
    rate; tax and insurance are the detail behind "withheld"."""
    rows = session.exec(
        select(Paycheck).where(Paycheck.pay_date >= start, Paycheck.pay_date < end)
    ).all()
    return {
        "gross": round(sum(p.gross for p in rows), 2),
        "net": round(sum(p.net for p in rows), 2),
        "k401": round(sum(p.retirement_401k for p in rows), 2),
        "tax": round(
            sum(
                p.federal_tax + p.state_tax + p.social_security + p.medicare
                for p in rows
            ),
            2,
        ),
        "insurance": round(sum(p.insurance for p in rows), 2),
    }


def flow(session: Session, today: dt.date) -> dict:
    """Gross pay split twice: into withheld / 401(k) / take-home, then take-home
    into what it was committed to and what survived.

    The old `sankey` computed a spending total and threw it away, so take-home
    never balanced against its outflows. Here `kept` is the explicit residual,
    which is what makes "nothing unaccounted for" a checkable claim.
    """
    cadence, anchor = payperiods.get_pay_config(session)
    start, end = payperiods.period_for_date(today, cadence, anchor)
    days_total = max((end - start).days, 1)
    days_elapsed = min(max((today - start).days + 1, 1), days_total)

    pay = paycheck_totals(session, start, end)
    gross, takehome, k401 = pay["gross"], pay["net"], pay["k401"]
    tax, insurance = pay["tax"], pay["insurance"]
    # Taken as the residual so split 1 sums to gross to the cent even when a
    # paystub's own components do not reconcile. `detail` carries the parts.
    withheld = round(gross - k401 - takehome, 2)

    by_cat = spending_by_category(session, start, end)
    tiers = tier_breakdown(by_cat)
    spend_total = round(sum(r["amount"] for r in by_cat), 2)
    kept = round(takehome - spend_total, 2)

    avg_cat = category_averages(session, today, 6, to_day=days_elapsed)
    avg_tiers = tier_breakdown(
        [{"category": c, "amount": a} for c, a in avg_cat.items()]
    )
    avg_spend_total = round(sum(avg_cat.values()), 2)
    # Same take-home, average spending: this is what makes the shortfall in
    # "kept" exactly equal this period's overspend.
    avg_kept = round(takehome - avg_spend_total, 2)

    children = sorted(
        (
            {
                "name": r["category"],
                "value": r["amount"],
                "avg": avg_cat.get(r["category"], 0.0),
            }
            for r in by_cat
            if tier_for(r["category"]) == DISCRETIONARY
        ),
        key=lambda c: c["value"],
        reverse=True,
    )

    split2 = [
        {
            "key": FIXED,
            "label": TIER_LABELS[FIXED],
            "value": tiers[FIXED],
            "avg": avg_tiers[FIXED],
        },
        {
            "key": ESSENTIAL,
            "label": TIER_LABELS[ESSENTIAL],
            "value": tiers[ESSENTIAL],
            "avg": avg_tiers[ESSENTIAL],
        },
        {
            "key": DISCRETIONARY,
            "label": TIER_LABELS[DISCRETIONARY],
            "value": tiers[DISCRETIONARY],
            "avg": avg_tiers[DISCRETIONARY],
            "children": children,
        },
    ]
    # Only present when excluded-category spending actually happened. Without
    # it those dollars would silently inflate "kept in cash".
    if tiers[EXCLUDED] > 0.005:
        split2.append(
            {
                "key": "unclassified",
                "label": "Taxes & fees",
                "value": tiers[EXCLUDED],
                "avg": avg_tiers[EXCLUDED],
            }
        )
    split2.append(
        {"key": "kept", "label": "Kept in cash", "value": kept, "avg": avg_kept}
    )

    return {
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "days_elapsed": days_elapsed,
        "days_total": days_total,
        "gross": gross,
        "split1": [
            {
                "key": "withheld",
                "label": "Withheld",
                "value": withheld,
                "detail": {"tax": tax, "insurance": insurance},
            },
            {"key": "k401", "label": "401(k)", "value": k401},
            {"key": "takehome", "label": "Take-home", "value": takehome},
        ],
        "split2": split2,
    }
