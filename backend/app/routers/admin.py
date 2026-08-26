from fastapi import APIRouter, Depends
from sqlmodel import Session, delete

from app.db import get_session
from app.models import (
    Account,
    BalanceSnapshot,
    Holding,
    Item,
    Paycheck,
    Transaction,
)
from app.security import AuthDep

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[AuthDep])


@router.post("/reset")
def reset_data(session: Session = Depends(get_session)) -> dict:
    """Wipe all financial data (accounts, transactions, items, holdings,
    snapshots, paychecks). Keeps settings and contribution goals.
    """
    for model in (Transaction, Holding, BalanceSnapshot, Paycheck, Account, Item):
        session.exec(delete(model))
    session.commit()
    return {"message": "reset complete"}
