from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.security import AuthDep
from app.services import sync_manager

router = APIRouter(tags=["sync"], dependencies=[AuthDep])


@router.post("/sync")
def sync_all(session: Session = Depends(get_session)) -> dict:
    """Sync every connected item (Plaid + SimpleFIN)."""
    return sync_manager.sync_all(session)
