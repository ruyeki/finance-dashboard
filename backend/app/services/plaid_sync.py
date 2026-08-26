"""Orchestrates a Plaid pull into our tables: accounts, transactions, holdings."""

import datetime as dt
import logging

from sqlmodel import Session, select

from app.models import (
    Account,
    AccountType,
    BalanceSnapshot,
    Holding,
    Item,
    Transaction,
)
from app.security import decrypt
from app.services import categorize, plaid_client

logger = logging.getLogger(__name__)


def map_account_type(ptype: str, psubtype: str) -> AccountType:
    ptype = (ptype or "").lower()
    psubtype = (psubtype or "").lower()
    if ptype == "depository":
        return AccountType.savings if psubtype in {"savings", "hsa", "cd"} else AccountType.checking
    if ptype == "credit":
        return AccountType.credit
    if ptype == "investment":
        if psubtype in {"roth", "roth 401k"}:
            return AccountType.roth
        if psubtype in {"401k", "401a", "403b", "457b"}:
            return AccountType._401k
        return AccountType.brokerage
    return AccountType.other


def upsert_accounts(session: Session, item: Item, plaid_accounts: list) -> dict:
    """Create/update Accounts for this item; return {plaid_account_id: Account}."""
    result: dict[str, Account] = {}
    for pa in plaid_accounts:
        pid = pa.account_id
        acct = session.exec(
            select(Account).where(Account.plaid_account_id == pid)
        ).first()
        balances = pa.balances
        current = float(balances.current) if balances.current is not None else 0.0
        available = float(balances.available) if balances.available is not None else None
        # Plaid reports credit/loan balances as positive amounts owed; store them
        # negative so net worth = sum of balances (matches SimpleFIN convention).
        if str(pa.type).lower() in {"credit", "loan"}:
            current = -abs(current)
            if available is not None:
                available = -abs(available)
        if not acct:
            acct = Account(
                item_id=item.id,
                plaid_account_id=pid,
                name=pa.name,
                institution=item.institution_name,
                type=map_account_type(str(pa.type), str(pa.subtype) if pa.subtype else ""),
                subtype=str(pa.subtype) if pa.subtype else None,
                is_manual=False,
            )
        acct.current_balance = current
        acct.available_balance = available
        acct.updated_at = dt.datetime.now(dt.timezone.utc)
        session.add(acct)
        session.flush()
        result[pid] = acct
    session.commit()
    return result


def _snapshot(session: Session, account_id: int, balance: float) -> None:
    today = dt.date.today()
    existing = session.exec(
        select(BalanceSnapshot).where(
            BalanceSnapshot.account_id == account_id,
            BalanceSnapshot.date == today,
        )
    ).first()
    if existing:
        existing.balance = balance
        session.add(existing)
    else:
        session.add(BalanceSnapshot(account_id=account_id, date=today, balance=balance))


def _upsert_transaction(session: Session, pt, acct: Account) -> None:
    pfc = getattr(pt, "personal_finance_category", None)
    primary = getattr(pfc, "primary", None) if pfc else None
    detailed = getattr(pfc, "detailed", None) if pfc else None
    name = pt.merchant_name or pt.name

    txn = session.exec(
        select(Transaction).where(Transaction.plaid_transaction_id == pt.transaction_id)
    ).first()
    category, source = categorize.categorize_from_plaid(session, name, primary, detailed)
    is_income = primary == "INCOME"
    is_transfer = primary in {"TRANSFER_IN", "TRANSFER_OUT"}

    if not txn:
        txn = Transaction(
            account_id=acct.id,
            plaid_transaction_id=pt.transaction_id,
            date=pt.date,
            amount=float(pt.amount),
            merchant_name=pt.merchant_name,
            raw_name=pt.name,
            category=category,
            category_source=source,
            pending=bool(pt.pending),
            is_income=is_income,
            is_transfer=is_transfer,
        )
    else:
        # Preserve a manual re-categorization; otherwise refresh.
        txn.amount = float(pt.amount)
        txn.pending = bool(pt.pending)
        txn.merchant_name = pt.merchant_name
        txn.raw_name = pt.name
        if txn.category_source != "manual":
            txn.category = category
            txn.category_source = source
        txn.is_income = is_income
        txn.is_transfer = is_transfer
    session.add(txn)


def sync_item(session: Session, item: Item) -> dict:
    access = decrypt(item.access_token)

    # 1) Accounts + balances
    plaid_accounts = plaid_client.get_accounts(access)
    acc_map = upsert_accounts(session, item, plaid_accounts)
    for pid, acct in acc_map.items():
        _snapshot(session, acct.id, acct.current_balance)

    # 2) Transactions (incremental via cursor)
    res = plaid_client.sync_transactions(access, item.transactions_cursor)
    for pt in res["added"] + res["modified"]:
        acct = acc_map.get(pt.account_id)
        if acct:
            _upsert_transaction(session, pt, acct)
    for pt in res["removed"]:
        existing = session.exec(
            select(Transaction).where(
                Transaction.plaid_transaction_id == pt.transaction_id
            )
        ).first()
        if existing:
            session.delete(existing)
    item.transactions_cursor = res["next_cursor"]

    # 3) Investment holdings (if the item supports it)
    holdings_count = 0
    try:
        data = plaid_client.get_holdings(access)
        sec_by_id = {s.security_id: s for s in data["securities"]}
        for pid, acct in acc_map.items():
            session.exec(
                select(Holding).where(Holding.account_id == acct.id)
            )  # noqa
        # Replace holdings for these accounts.
        for acct in acc_map.values():
            for h in session.exec(
                select(Holding).where(Holding.account_id == acct.id)
            ).all():
                session.delete(h)
        for h in data["holdings"]:
            acct = acc_map.get(h.account_id)
            if not acct:
                continue
            sec = sec_by_id.get(h.security_id)
            session.add(
                Holding(
                    account_id=acct.id,
                    ticker=getattr(sec, "ticker_symbol", None) if sec else None,
                    name=getattr(sec, "name", "") or "" if sec else "",
                    quantity=float(h.quantity),
                    cost_basis=float(h.cost_basis) if h.cost_basis is not None else None,
                    value=float(h.institution_value),
                )
            )
            holdings_count += 1
    except Exception as exc:  # noqa: BLE001
        logger.info("No investments data for item %s: %s", item.id, exc)

    item.last_synced_at = dt.datetime.now(dt.timezone.utc)
    session.add(item)
    session.commit()

    # 4) Best-effort AI categorization of anything still uncategorized.
    ai_updated = categorize.categorize_uncategorized(session)

    return {
        "accounts": len(acc_map),
        "added": len(res["added"]),
        "modified": len(res["modified"]),
        "removed": len(res["removed"]),
        "holdings": holdings_count,
        "ai_categorized": ai_updated,
    }


def sync_all(session: Session) -> dict:
    items = session.exec(select(Item)).all()
    totals: dict[str, int] = {}
    for item in items:
        try:
            r = sync_item(session, item)
            for k, v in r.items():
                totals[k] = totals.get(k, 0) + v
        except Exception as exc:  # noqa: BLE001
            logger.exception("Sync failed for item %s: %s", item.id, exc)
    return totals
