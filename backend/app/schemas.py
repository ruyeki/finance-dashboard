from datetime import date

from pydantic import BaseModel


class LoginRequest(BaseModel):
    password: str


class MessageResponse(BaseModel):
    message: str


class ManualAccountCreate(BaseModel):
    name: str
    institution: str = ""
    type: str = "_401k"
    current_balance: float = 0.0


class AccountUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    institution: str | None = None


class BalanceSnapshotCreate(BaseModel):
    account_id: int
    date: date
    balance: float
    contributions_ytd: float | None = None


class TransactionUpdate(BaseModel):
    category: str | None = None
    notes: str | None = None
    is_transfer: bool | None = None


class PaycheckCreate(BaseModel):
    pay_date: date
    gross: float = 0.0
    federal_tax: float = 0.0
    state_tax: float = 0.0
    social_security: float = 0.0
    medicare: float = 0.0
    insurance: float = 0.0
    retirement_401k: float = 0.0
    net: float = 0.0
    employer: str | None = None


class PaycheckUpdate(BaseModel):
    pay_date: date | None = None
    gross: float | None = None
    federal_tax: float | None = None
    state_tax: float | None = None
    social_security: float | None = None
    medicare: float | None = None
    insurance: float | None = None
    retirement_401k: float | None = None
    net: float | None = None
    employer: str | None = None
