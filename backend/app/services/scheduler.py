"""Periodic account sync, run in-process by APScheduler.

`POST /sync` and this job call the same `sync_manager.sync_all`; the only
difference is where the Session comes from. A request gets one from
`get_session` (a FastAPI dependency), which cannot be used here — this job runs
on a scheduler thread with no request context, so it opens its own.

The scheduler lives and dies with the uvicorn process (see `main.lifespan`).
There is no job store: nothing is persisted, and nothing runs while the server
is down.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session

from app.config import settings
from app.db import engine
from app.models import AccountType
from app.services import holdings, sync_manager

logger = logging.getLogger(__name__)

JOB_ID = "sync_all"

_scheduler: BackgroundScheduler | None = None


def run_sync() -> None:
    """Sync every connected item.

    Deliberately never raises: an exception escaping a job would be logged by
    APScheduler and the run lost, and we would rather log it in our own shape.
    `sync_all` already isolates per-item failures, so this only catches the
    surrounding session/engine errors.
    """
    try:
        with Session(engine) as session:
            totals = sync_manager.sync_all(session)
        logger.info("Scheduled sync finished: %s", totals or "no items connected")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Scheduled sync failed: %s", exc)


def run_revalue_daily() -> None:
    """Reprice all investment holdings (mutual funds price once daily) and, on
    paydays, auto-invest scheduled contributions (e.g. the 401k)."""
    try:
        with Session(engine) as session:
            r = holdings.revalue(session)
            c = holdings.apply_scheduled_contributions(session)
        logger.info("Daily revalue: %s; contributions: %s", r, c)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Daily revalue failed: %s", exc)


def run_revalue_brokerage() -> None:
    """Reprice brokerage holdings only (ETFs/stocks move intraday)."""
    try:
        with Session(engine) as session:
            r = holdings.revalue(session, [AccountType.brokerage])
        logger.info("Hourly brokerage revalue: %s", r)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Brokerage revalue failed: %s", exc)


def start() -> None:
    """Start the sync + revalue jobs unless disabled or already running."""
    global _scheduler

    if _scheduler is not None:
        return

    scheduler = BackgroundScheduler()

    minutes = settings.sync_interval_minutes
    if minutes > 0:
        scheduler.add_job(
            run_sync,
            trigger="interval",
            minutes=minutes,
            id=JOB_ID,
            # One sync at a time: a run that outlives its interval must not overlap
            # itself and fight for SQLite's single write lock.
            max_instances=1,
            # If the machine slept through several intervals, run once on wake
            # instead of once per interval missed.
            coalesce=True,
            misfire_grace_time=300,
            replace_existing=True,
        )
        logger.info("Scheduled sync every %s minute(s).", minutes)
    else:
        logger.info("Scheduled sync disabled (sync_interval_minutes=%s).", minutes)

    if settings.holdings_revalue_hours > 0:
        scheduler.add_job(
            run_revalue_daily,
            trigger="interval",
            hours=settings.holdings_revalue_hours,
            id="revalue_daily",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=600,
            replace_existing=True,
        )
    if settings.brokerage_revalue_minutes > 0:
        scheduler.add_job(
            run_revalue_brokerage,
            trigger="interval",
            minutes=settings.brokerage_revalue_minutes,
            id="revalue_brokerage",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=300,
            replace_existing=True,
        )

    if not scheduler.get_jobs():
        logger.info("No scheduled jobs enabled.")
        return
    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "Revalue jobs: holdings every %sh, brokerage every %sm.",
        settings.holdings_revalue_hours,
        settings.brokerage_revalue_minutes,
    )


def shutdown() -> None:
    """Stop the scheduler. Safe to call when it never started."""
    global _scheduler

    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    logger.info("Scheduled sync stopped.")
