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
from app.services import sync_manager

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


def start() -> None:
    """Start the sync job unless it is disabled or already running."""
    global _scheduler

    minutes = settings.sync_interval_minutes
    if minutes <= 0:
        logger.info("Scheduled sync disabled (sync_interval_minutes=%s).", minutes)
        return
    if _scheduler is not None:
        return

    scheduler = BackgroundScheduler()
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
    scheduler.start()
    _scheduler = scheduler
    # First run lands one interval from now, not at boot: syncing on startup
    # would hit the providers on every `--reload`.
    logger.info("Scheduled sync every %s minute(s).", minutes)


def shutdown() -> None:
    """Stop the scheduler. Safe to call when it never started."""
    global _scheduler

    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    logger.info("Scheduled sync stopped.")
