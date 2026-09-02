"""Sync a SimpleFIN connection into our tables (accounts, transactions, holdings)."""

import datetime as dt
import logging

from sqlmodel import Session, select

from app.models import (
    Account,
    AccountType,
    BalanceSnapshot,
    CategorySource,
    Holding,
    Item,
    Transaction,
)
from app.security import decrypt
from app.services import categorize, simplefin_client

logger = logging.getLogger(__name__)

LOOKBACK_DAYS = 45  # SimpleFIN recommends <= 45 days per request


def infer_account_type(name: str, has_holdings: bool) -> AccountType:
    n = name.lower()
    if "roth" in n:
        return AccountType.roth
    if "401" in n or "403b" in n:
        return AccountType._401k
    if "ira" in n or "brokerage" in n or "invest" in n:
        return AccountType.brokerage
    # Credit cards first — brand names often include words like "cash rewards".
    if any(
        k in n
        for k in ("credit", "card", "visa", "mastercard", "amex", "american express",
                  "discover", "rewards", "signature", "platinum")
    ):
        return AccountType.credit
    if any(k in n for k in ("savings", "hysa", "money market", "cd", "hsa")):
        return AccountType.savings
    if "checking" in n or "cash" in n:
        return AccountType.checking
    return AccountType.brokerage if has_holdings else AccountType.other


def _to_float(val, default=0.0):
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


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


def sync_item(session: Session, item: Item) -> dict:
    access_url = decrypt(item.access_token)
    start = dt.date.today() - dt.timedelta(days=LOOKBACK_DAYS)
    data = simplefin_client.fetch_accounts(access_url, start_date=start)

    errors = data.get("errors") or []
    for e in errors:
        logger.info("SimpleFIN notice: %s", e)

    income_keywords = categorize.get_income_keywords(session)
    accounts_seen = 0
    txns_added = 0
    holdings_count = 0

    for sa in data.get("accounts", []):
        ext_id = sa.get("id")
        if not ext_id:
            continue
        org_name = (sa.get("org") or {}).get("name") or item.institution_name or "Bank"
        holdings = sa.get("holdings") or []
        balance = _to_float(sa.get("balance"))

        acct = session.exec(
            select(Account).where(Account.plaid_account_id == ext_id)
        ).first()
        if not acct:
            acct = Account(
                item_id=item.id,
                plaid_account_id=ext_id,
                name=sa.get("name", "Account"),
                institution=org_name,
                type=infer_account_type(sa.get("name", ""), bool(holdings)),
                currency=sa.get("currency", "USD"),
                is_manual=False,
            )
        acct.current_balance = balance
        acct.available_balance = (
            _to_float(sa["available-balance"]) if sa.get("available-balance") else None
        )
        acct.institution = org_name
        acct.updated_at = dt.datetime.now(dt.timezone.utc)
        session.add(acct)
        session.flush()
        accounts_seen += 1

        _snapshot(session, acct.id, balance)

        # Transactions (SimpleFIN: positive = deposit; negate to our spend-positive convention)
        for t in sa.get("transactions", []):
            tid = t.get("id")
            if not tid:
                continue
            sf_amount = _to_float(t.get("amount"))
            posted = t.get("transacted_at") or t.get("posted")
            try:
                tdate = dt.datetime.fromtimestamp(int(posted), dt.timezone.utc).date()
            except (TypeError, ValueError):
                tdate = dt.date.today()
            merchant = t.get("payee") or t.get("description") or ""

            existing = session.exec(
                select(Transaction).where(Transaction.plaid_transaction_id == tid)
            ).first()
            desc = t.get("description", "")
            if sf_amount > 0:
                # Money in: paycheck/interest = income; internal moves = transfer.
                blob = f"{merchant} {desc}"
                category, source, is_income, is_transfer = categorize.classify_inflow(
                    blob, income_keywords
                )
            else:
                # Money out: exclude transfers (card payoffs, Zelle, ATM, bank
                # payments, account moves) from spending; keep real purchases.
                is_transfer = categorize.detect_transfer(merchant) or categorize.detect_transfer(desc)
                is_income = False
                if is_transfer:
                    category, source = "Transfer", CategorySource.rule
                else:
                    category, source = categorize.categorize_from_plaid(session, merchant, None, None)
            if existing:
                if existing.category_source != CategorySource.manual:
                    existing.category = category
                    existing.category_source = source
                    existing.is_transfer = is_transfer
                    existing.is_income = is_income
                existing.amount = -sf_amount
                existing.pending = bool(t.get("pending"))
                session.add(existing)
            else:
                session.add(
                    Transaction(
                        account_id=acct.id,
                        plaid_transaction_id=tid,
                        date=tdate,
                        amount=-sf_amount,
                        merchant_name=merchant,
                        raw_name=desc,
                        category=category,
                        category_source=source,
                        pending=bool(t.get("pending")),
                        is_income=is_income,
                        is_transfer=is_transfer,
                    )
                )
                txns_added += 1

        # Holdings (optional SimpleFIN extension)
        if holdings:
            for h in session.exec(
                select(Holding).where(Holding.account_id == acct.id)
            ).all():
                session.delete(h)
            for h in holdings:
                session.add(
                    Holding(
                        account_id=acct.id,
                        ticker=h.get("symbol"),
                        name=h.get("description", "") or "",
                        quantity=_to_float(h.get("shares")),
                        cost_basis=_to_float(h["cost_basis"]) if h.get("cost_basis") else None,
                        value=_to_float(h.get("market_value")),
                    )
                )
                holdings_count += 1

    item.last_synced_at = dt.datetime.now(dt.timezone.utc)
    session.add(item)
    session.commit()

    ai_updated = categorize.categorize_uncategorized(session)
    return {
        "accounts": accounts_seen,
        "added": txns_added,
        "holdings": holdings_count,
        "ai_categorized": ai_updated,
        "notices": errors,
    }
