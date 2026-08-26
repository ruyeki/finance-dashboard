"""Dispatches a sync across all connected items, by provider."""

import logging

from sqlmodel import Session, select

from app.models import Item
from app.services import plaid_sync, simplefin_sync

logger = logging.getLogger(__name__)


def sync_item(session: Session, item: Item) -> dict:
    if item.provider == "simplefin":
        return simplefin_sync.sync_item(session, item)
    return plaid_sync.sync_item(session, item)


def sync_all(session: Session) -> dict:
    items = session.exec(select(Item)).all()
    totals: dict[str, int] = {}
    for item in items:
        try:
            r = sync_item(session, item)
            for k, v in r.items():
                if isinstance(v, (int, float)):
                    totals[k] = totals.get(k, 0) + v
        except Exception as exc:  # noqa: BLE001
            logger.exception("Sync failed for item %s (%s): %s", item.id, item.provider, exc)
    return totals
