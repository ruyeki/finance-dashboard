# Finance Dashboard

A self-hosted, single-user personal finance dashboard.

- **Backend:** FastAPI + SQLModel + SQLite (`backend/`)
- **Frontend:** Next.js + TypeScript + Tailwind (`frontend/`)
- **Account sync:** Plaid (BoA, Marcus, Fidelity); manual entry for Guideline 401k
- **Categorization:** rules → Plaid category → Gemini fallback
- **Paycheck:** upload Gusto paystub PDF → Gemini parses the breakdown

See `.claude/plans` or the project plan for the full design.

## Prerequisites

- Python 3.12+ (tested on 3.14) with the `py` launcher (Windows) or `python3`
- Node.js 20+ / npm

## Backend

```bash
cd backend
py -m venv .venv                       # first time only
./.venv/Scripts/python.exe -m pip install -r requirements.txt
cp .env.example .env                   # then fill in secrets (see below)
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8787
```

Generate the required secrets:

```bash
# SECRET_KEY
py -c "import secrets; print(secrets.token_urlsafe(48))"
# ENCRYPTION_KEY (Fernet)
py -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set `APP_PASSWORD` to whatever you want to log in with. Fill `PLAID_*` and
`GEMINI_API_KEY` when ready (the app runs without them; those features stay off).

## Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

> Use `localhost` for both servers (not `127.0.0.1`) so the session cookie is
> treated as same-site across ports.

## Notes

- FastAPI is pinned to `0.115.6` — `0.141.x` has a broken `include_router`.
- React is pinned to `18.3.1` because `@visx/sankey` doesn't yet declare React 19
  peer support.
