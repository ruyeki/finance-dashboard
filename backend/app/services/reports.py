"""Generate and store AI finance reports, one per pay period."""

import datetime as dt

from sqlmodel import Session, select

from app.config import settings
from app.models import Report
from app.services import gemini, holdings, metrics, payperiods


def build_context(session: Session, as_of: dt.date) -> tuple[dict, dict]:
    """Assemble the figures for the pay period containing `as_of`."""
    summ = metrics.spending_summary(session, as_of)
    stocks = holdings.stocks_overview(session)
    hist = holdings.portfolio_history(session, None, "1mo")
    goals = metrics.contribution_goals(session, as_of, as_of.year)

    context = {
        "period": {
            "start": summ["period_start"],
            "end": summ["period_end"],
            "cadence": summ["cadence"],
            "days_elapsed": summ["days_elapsed"],
            "days_total": summ["days_total"],
        },
        "spending": {
            "total": summ["total"],
            "previous_period_total": summ["previous_total"],
            "change_vs_previous": summ["delta"],
            "trailing_average": summ["average"],
            "daily_average": summ["daily_avg"],
            "projected_full_period": summ["projected"],
            "income": summ["income"],
            "net_cash_flow": summ["net_cash_flow"],
            "savings_rate_pct": summ.get("savings_rate"),
            "by_tier": summ.get("by_tier"),
            "tier_trailing_averages": summ.get("tier_averages"),
            "by_category": summ["by_category"][:10],
            "category_trailing_averages": summ.get("category_averages"),
            "by_source": summ.get("by_source"),
            "top_merchants": summ.get("top_merchants"),
            "discretionary_spent": summ.get("discretionary_spent"),
            "discretionary_budget": summ.get("discretionary_budget"),
        },
        "portfolio": {
            "total_invested": stocks["total"],
            "accounts": [
                {"type": a["type_label"], "value": a["value"]} for a in stocks["accounts"]
            ],
            "period_return_pct": hist.get("portfolio_return"),
            "sp500_return_pct": hist.get("sp500_return"),
        },
        "retirement_goals": goals,
    }
    return context, summ


def generate(session: Session, as_of: dt.date | None = None) -> Report:
    as_of = as_of or dt.date.today()
    context, summ = build_context(session, as_of)
    result = gemini.analyze_finances(context)

    start = dt.date.fromisoformat(summ["period_start"])
    end = dt.date.fromisoformat(summ["period_end"])
    report = session.exec(select(Report).where(Report.period_start == start)).first()
    if not report:
        report = Report(period_start=start, period_end=end)
    report.period_end = end
    report.content = result
    report.headline = str(result.get("headline", ""))[:400]
    report.model = settings.gemini_model
    report.generated_at = dt.datetime.now(dt.timezone.utc)
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def list_reports(session: Session) -> list[Report]:
    return session.exec(select(Report).order_by(Report.period_start.desc())).all()


def latest(session: Session) -> Report | None:
    return session.exec(
        select(Report).order_by(Report.period_start.desc())
    ).first()


def generate_for_completed_period(session: Session) -> Report | None:
    """On a payday (period boundary), generate a report for the period that just
    ended, unless one already exists. Called by the scheduler."""
    cadence, anchor = payperiods.get_pay_config(session)
    today = dt.date.today()
    start, _ = payperiods.period_for_date(today, cadence, anchor)
    if start != today:
        return None  # not a payday
    prev_day = today - dt.timedelta(days=1)  # a day inside the completed period
    prev_start, _ = payperiods.period_for_date(prev_day, cadence, anchor)
    if session.exec(select(Report).where(Report.period_start == prev_start)).first():
        return None  # already generated
    if not gemini.is_enabled():
        return None
    return generate(session, prev_day)
