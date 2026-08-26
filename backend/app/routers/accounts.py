import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Account, AccountType, BalanceSnapshot
from app.schemas import AccountUpdate, BalanceSnapshotCreate, ManualAccountCreate
from app.security import AuthDep

router = APIRouter(prefix="/accounts", tags=["accounts"], dependencies=[AuthDep])


@router.get("")
def list_accounts(session: Session = Depends(get_session)) -> list[Account]:
    return session.exec(select(Account).order_by(Account.name)).all()


@router.post("/manual", response_model=Account)
def create_manual_account(
    body: ManualAccountCreate, session: Session = Depends(get_session)
) -> Account:
    try:
        acct_type = AccountType(body.type)
    except ValueError:
        raise HTTPException(400, f"Invalid account type: {body.type}")
    account = Account(
        name=body.name,
        institution=body.institution,
        type=acct_type,
        current_balance=body.current_balance,
        is_manual=True,
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    # Seed an initial snapshot so trends have a starting point.
    session.add(
        BalanceSnapshot(
            account_id=account.id,
            date=dt.date.today(),
            balance=account.current_balance,
        )
    )
    session.commit()
    return account


@router.patch("/{account_id}", response_model=Account)
def update_account(
    account_id: int, body: AccountUpdate, session: Session = Depends(get_session)
) -> Account:
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    if body.name is not None:
        account.name = body.name
    if body.institution is not None:
        account.institution = body.institution
    if body.type is not None:
        try:
            account.type = AccountType(body.type)
        except ValueError:
            raise HTTPException(400, f"Invalid account type: {body.type}")
    account.updated_at = dt.datetime.now(dt.timezone.utc)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.delete("/{account_id}")
def delete_account(account_id: int, session: Session = Depends(get_session)) -> dict:
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    session.delete(account)
    session.commit()
    return {"message": "deleted"}


@router.post("/{account_id}/snapshot", response_model=BalanceSnapshot)
def add_snapshot(
    account_id: int,
    body: BalanceSnapshotCreate,
    session: Session = Depends(get_session),
) -> BalanceSnapshot:
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    snap = BalanceSnapshot(
        account_id=account_id,
        date=body.date,
        balance=body.balance,
        contributions_ytd=body.contributions_ytd,
    )
    session.add(snap)
    # Keep the account's current balance in sync with the latest snapshot.
    account.current_balance = body.balance
    account.updated_at = dt.datetime.now(dt.timezone.utc)
    session.add(account)
    session.commit()
    session.refresh(snap)
    return snap


@router.get("/{account_id}/snapshots")
def list_snapshots(
    account_id: int, session: Session = Depends(get_session)
) -> list[BalanceSnapshot]:
    return session.exec(
        select(BalanceSnapshot)
        .where(BalanceSnapshot.account_id == account_id)
        .order_by(BalanceSnapshot.date)
    ).all()
