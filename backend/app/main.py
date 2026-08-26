from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import run_migrations
from app.routers import (
    accounts,
    admin,
    auth,
    metrics,
    paychecks,
    plaid,
    settings_router,
    simplefin,
    sync,
    transactions,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    yield


app = FastAPI(title="Finance Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(plaid.router)
app.include_router(simplefin.router)
app.include_router(sync.router)
app.include_router(admin.router)
app.include_router(transactions.router)
app.include_router(paychecks.router)
app.include_router(metrics.router)
app.include_router(settings_router.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "plaid_env": settings.plaid_env}
