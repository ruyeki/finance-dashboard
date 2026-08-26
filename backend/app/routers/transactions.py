import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import CategorySource, Transaction
from app.schemas import TransactionUpdate
from app.security import AuthDep
from app.services import categorize

router = APIRouter(prefix="/transactions", tags=["transactions"], dependencies=[AuthDep])


@router.get("")
def list_transactions(
    session: Session = Depends(get_session),
    limit: int = Query(100, le=500),
    offset: int = 0,
    category: str | None = None,
    account_id: int | None = None,
    start: dt.date | None = None,
    end: dt.date | None = None,
) -> list[Transaction]:
    stmt = select(Transaction)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    if start:
        stmt = stmt.where(Transaction.date >= start)
    if end:
        stmt = stmt.where(Transaction.date < end)
    stmt = stmt.order_by(Transaction.date.desc()).offset(offset).limit(limit)
    return session.exec(stmt).all()


@router.patch("/{txn_id}", response_model=Transaction)
def update_transaction(
    txn_id: int, body: TransactionUpdate, session: Session = Depends(get_session)
) -> Transaction:
    txn = session.get(Transaction, txn_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")

    if body.category is not None and body.category != txn.category:
        txn.category = body.category
        txn.category_source = CategorySource.manual
        # Keep the transfer/income flags consistent with the chosen category so
        # spending totals update: "Transfer"/"Income" are excluded from spend,
        # anything else counts. (Overridden if is_transfer is sent explicitly.)
        txn.is_transfer = body.category == "Transfer"
        txn.is_income = body.category == "Income"
        # Remember the correction as a reusable rule.
        categorize.add_rule_from_correction(session, txn, body.category)
    if body.notes is not None:
        txn.notes = body.notes
    if body.is_transfer is not None:
        txn.is_transfer = body.is_transfer

    session.add(txn)
    session.commit()
    session.refresh(txn)
    return txn


@router.post("/categorize")
def run_categorization(session: Session = Depends(get_session)) -> dict:
    """Batch-classify uncategorized transactions with Gemini (if configured)."""
    updated = categorize.categorize_uncategorized(session)
    return {"updated": updated}


@router.post("/reclassify")
def reclassify(session: Session = Depends(get_session)) -> dict:
    """Re-run transfer detection + rules (+ Gemini) over all transactions."""
    return categorize.reclassify_all(session)
