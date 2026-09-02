import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Report
from app.security import AuthDep
from app.services import gemini, reports

router = APIRouter(prefix="/reports", tags=["reports"], dependencies=[AuthDep])


@router.get("")
def list_reports(session: Session = Depends(get_session)) -> list[dict]:
    return [
        {
            "id": r.id,
            "period_start": r.period_start.isoformat(),
            "period_end": r.period_end.isoformat(),
            "generated_at": r.generated_at.isoformat(),
            "headline": r.headline,
        }
        for r in reports.list_reports(session)
    ]


@router.get("/latest", response_model=Report | None)
def latest(session: Session = Depends(get_session)) -> Report | None:
    return reports.latest(session)


@router.post("/generate", response_model=Report)
def generate(
    as_of: dt.date | None = None, session: Session = Depends(get_session)
) -> Report:
    if not gemini.is_enabled():
        raise HTTPException(400, "GEMINI_API_KEY is not configured.")
    try:
        return reports.generate(session, as_of)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Report generation failed: {exc}")


@router.get("/{report_id}", response_model=Report)
def get_report(report_id: int, session: Session = Depends(get_session)) -> Report:
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    return report
