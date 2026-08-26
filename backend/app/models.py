import datetime as dt
from enum import Enum

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def today() -> dt.date:
    return dt.datetime.now(dt.timezone.utc).date()


class AccountType(str, Enum):
    checking = "checking"
    savings = "savings"
    brokerage = "brokerage"
    roth = "roth"
    _401k = "_401k"
    credit = "credit"
    other = "other"


class CategorySource(str, Enum):
    plaid = "plaid"
    rule = "rule"
    ai = "ai"
    manual = "manual"
    uncategorized = "uncategorized"


class MatchType(str, Enum):
    contains = "contains"
    exact = "exact"
    regex = "regex"


class Item(SQLModel, table=True):
    """A single aggregator connection (Plaid item, or one SimpleFIN access URL)."""

    id: int | None = Field(default=None, primary_key=True)
    provider: str = Field(default="plaid", index=True)  # plaid | simplefin
    plaid_item_id: str = Field(index=True, unique=True)
    institution_name: str = ""
    access_token: str  # encrypted at rest (Fernet); Plaid access_token or SimpleFIN access URL
    transactions_cursor: str | None = None
    last_synced_at: dt.datetime | None = None
    created_at: dt.datetime = Field(default_factory=utcnow)


class Account(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    item_id: int | None = Field(default=None, foreign_key="item.id", index=True)
    plaid_account_id: str | None = Field(default=None, index=True, unique=True)
    name: str
    institution: str = ""
    type: AccountType = AccountType.other
    subtype: str | None = None
    current_balance: float = 0.0
    available_balance: float | None = None
    currency: str = "USD"
    is_manual: bool = False
    created_at: dt.datetime = Field(default_factory=utcnow)
    updated_at: dt.datetime = Field(default_factory=utcnow)


class Transaction(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True)
    plaid_transaction_id: str | None = Field(default=None, index=True, unique=True)
    date: dt.date = Field(index=True)
    amount: float  # positive = money out (spend), negative = money in, Plaid convention
    merchant_name: str | None = None
    raw_name: str = ""
    category: str = "Uncategorized"
    category_source: CategorySource = CategorySource.uncategorized
    pending: bool = False
    is_income: bool = False
    is_transfer: bool = False
    notes: str | None = None
    created_at: dt.datetime = Field(default_factory=utcnow)


class CategoryRule(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    match_type: MatchType = MatchType.contains
    pattern: str
    category: str
    created_at: dt.datetime = Field(default_factory=utcnow)


class Holding(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True)
    ticker: str | None = None
    name: str = ""
    quantity: float = 0.0
    cost_basis: float | None = None
    value: float = 0.0
    as_of: dt.date = Field(default_factory=today)


class BalanceSnapshot(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True)
    date: dt.date = Field(index=True)
    balance: float
    contributions_ytd: float | None = None
    created_at: dt.datetime = Field(default_factory=utcnow)


class Paycheck(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    pay_date: dt.date = Field(index=True)
    gross: float = 0.0
    federal_tax: float = 0.0
    state_tax: float = 0.0
    social_security: float = 0.0
    medicare: float = 0.0
    insurance: float = 0.0
    retirement_401k: float = 0.0
    other_deductions: dict = Field(default_factory=dict, sa_column=Column(JSON))
    net: float = 0.0
    employer: str | None = None
    source_pdf_path: str | None = None
    parsed_by: str = "ai"  # ai | manual
    created_at: dt.datetime = Field(default_factory=utcnow)


class ContributionGoal(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    account_type: AccountType
    year: int = Field(index=True)
    limit: float
    contributed_ytd: float = 0.0


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str
