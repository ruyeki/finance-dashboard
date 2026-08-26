"""Pay-period computation (biweekly by default, adjustable in settings)."""

import calendar
import datetime as dt

from sqlmodel import Session, select

from app.models import Setting

DEFAULT_CADENCE = "biweekly"
DEFAULT_ANCHOR = dt.date(2026, 1, 2)  # a known payday; adjust in settings


def get_setting(session: Session, key: str, default: str) -> str:
    row = session.get(Setting, key)
    return row.value if row else default


def get_pay_config(session: Session) -> tuple[str, dt.date]:
    cadence = get_setting(session, "pay_cadence", DEFAULT_CADENCE)
    anchor_str = get_setting(session, "pay_anchor", DEFAULT_ANCHOR.isoformat())
    try:
        anchor = dt.date.fromisoformat(anchor_str)
    except ValueError:
        anchor = DEFAULT_ANCHOR
    return cadence, anchor


def _fixed_interval_period(
    day: dt.date, anchor: dt.date, length: int
) -> tuple[dt.date, dt.date]:
    delta = (day - anchor).days
    periods = delta // length
    start = anchor + dt.timedelta(days=periods * length)
    end = start + dt.timedelta(days=length)
    return start, end


def period_for_date(
    day: dt.date, cadence: str, anchor: dt.date
) -> tuple[dt.date, dt.date]:
    """Return [start, end) containing `day` for the given cadence."""
    if cadence == "weekly":
        return _fixed_interval_period(day, anchor, 7)
    if cadence == "biweekly":
        return _fixed_interval_period(day, anchor, 14)
    if cadence == "semimonthly":
        if day.day <= 15:
            start = day.replace(day=1)
            end = day.replace(day=16)
        else:
            start = day.replace(day=16)
            last = calendar.monthrange(day.year, day.month)[1]
            end = day.replace(day=last) + dt.timedelta(days=1)
        return start, end
    # monthly (default fallback)
    start = day.replace(day=1)
    last = calendar.monthrange(day.year, day.month)[1]
    end = day.replace(day=last) + dt.timedelta(days=1)
    return start, end


def previous_period(
    start: dt.date, cadence: str, anchor: dt.date
) -> tuple[dt.date, dt.date]:
    return period_for_date(start - dt.timedelta(days=1), cadence, anchor)


def recent_periods(
    day: dt.date, cadence: str, anchor: dt.date, n: int
) -> list[tuple[dt.date, dt.date]]:
    """Most-recent-first list of `n` periods ending with the one containing `day`."""
    periods: list[tuple[dt.date, dt.date]] = []
    cur = period_for_date(day, cadence, anchor)
    for _ in range(n):
        periods.append(cur)
        cur = previous_period(cur[0], cadence, anchor)
    return periods
