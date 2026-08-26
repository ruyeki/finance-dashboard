"""Seed the database with demo data for local development.

Run:  ./.venv/Scripts/python.exe -m scripts.seed
"""

import datetime as dt
import random

from sqlmodel import Session, delete

from app.db import engine, run_migrations
from app.models import (
    Account,
    AccountType,
    BalanceSnapshot,
    CategorySource,
    ContributionGoal,
    Paycheck,
    Setting,
    Transaction,
)

TODAY = dt.date(2026, 8, 25)
ANCHOR = dt.date(2026, 8, 15)  # a payday; biweekly periods align to this

MERCHANTS = [
    ("Whole Foods Market", "Groceries", (40, 160)),
    ("Trader Joe's", "Groceries", (25, 90)),
    ("Chipotle", "Dining & Takeout", (12, 28)),
    ("Blue Bottle Coffee", "Coffee & Snacks", (5, 12)),
    ("Starbucks", "Coffee & Snacks", (4, 11)),
    ("Uber", "Transportation", (8, 35)),
    ("Shell Gas", "Gas & Fuel", (30, 70)),
    ("Amazon", "Shopping", (15, 120)),
    ("Uniqlo", "Clothing", (25, 90)),
    ("Netflix", "Subscriptions", (15, 16)),
    ("Spotify", "Subscriptions", (11, 12)),
    ("Equinox", "Health & Fitness", (60, 60)),
    ("PG&E", "Utilities", (70, 140)),
    ("Delta Air Lines", "Travel", (120, 340)),
    ("AMC Theatres", "Entertainment", (18, 45)),
]


def seed() -> None:
    run_migrations()
    with Session(engine) as s:
        # Clear existing data (dev only).
        for model in (Transaction, BalanceSnapshot, Paycheck, ContributionGoal, Account, Setting):
            s.exec(delete(model))
        s.commit()

        # Settings
        s.add(Setting(key="pay_cadence", value="biweekly"))
        s.add(Setting(key="pay_anchor", value=ANCHOR.isoformat()))

        # Accounts
        boa = Account(name="BofA Checking", institution="Bank of America",
                      type=AccountType.checking, current_balance=4820.55)
        marcus = Account(name="Marcus HYSA", institution="Marcus by Goldman Sachs",
                         type=AccountType.savings, current_balance=21500.00)
        roth = Account(name="Fidelity Roth IRA", institution="Fidelity",
                       type=AccountType.roth, current_balance=18240.12)
        brokerage = Account(name="Fidelity Brokerage", institution="Fidelity",
                            type=AccountType.brokerage, current_balance=9630.40)
        k401 = Account(name="Guideline 401(k)", institution="Guideline",
                       type=AccountType._401k, current_balance=31500.00, is_manual=True)
        for a in (boa, marcus, roth, brokerage, k401):
            s.add(a)
        s.commit()
        for a in (boa, marcus, roth, brokerage, k401):
            s.refresh(a)

        # Roth contribution goal
        s.add(ContributionGoal(account_type=AccountType.roth, year=2026,
                               limit=7500.0, contributed_ytd=4200.0))

        # Balance snapshots (growth over ~5 months) for HYSA + investments
        for months_ago in range(5, -1, -1):
            d = (TODAY.replace(day=1) - dt.timedelta(days=months_ago * 30))
            s.add(BalanceSnapshot(account_id=marcus.id, date=d,
                                  balance=round(21500 - months_ago * 380 + random.uniform(-40, 40), 2)))
            s.add(BalanceSnapshot(account_id=roth.id, date=d,
                                  balance=round(18240 - months_ago * 520 + random.uniform(-120, 120), 2)))
            s.add(BalanceSnapshot(account_id=brokerage.id, date=d,
                                  balance=round(9630 - months_ago * 240 + random.uniform(-90, 90), 2)))
            s.add(BalanceSnapshot(account_id=k401.id, date=d,
                                  balance=round(31500 - months_ago * 700 + random.uniform(-150, 150), 2)))

        # Transactions over the last ~10 weeks
        rng = random.Random(42)
        for days_ago in range(0, 72):
            d = TODAY - dt.timedelta(days=days_ago)
            for _ in range(rng.randint(0, 3)):
                name, cat, (lo, hi) = rng.choice(MERCHANTS)
                s.add(Transaction(
                    account_id=boa.id,
                    date=d,
                    amount=round(rng.uniform(lo, hi), 2),
                    merchant_name=name,
                    raw_name=name.upper(),
                    category=cat,
                    category_source=CategorySource.plaid,
                ))
            # biweekly paycheck deposits on paydays
            if (d - ANCHOR).days % 14 == 0:
                s.add(Transaction(
                    account_id=boa.id, date=d, amount=-2234.30,
                    merchant_name="Gusto Payroll", raw_name="GUSTO PAY",
                    category="Income", category_source=CategorySource.plaid,
                    is_income=True,
                ))

        # A parsed paycheck for the current period.
        # gross = taxes (1040.70) + insurance (145) + 401k (380) + net (2234.30)
        s.add(Paycheck(
            pay_date=ANCHOR, gross=3800.00, federal_tax=560.00, state_tax=190.00,
            social_security=235.60, medicare=55.10, insurance=145.00,
            retirement_401k=380.00, net=2234.30, employer="Persist AI",
            parsed_by="manual",
        ))

        s.commit()
    print("Seeded demo data.")


if __name__ == "__main__":
    seed()
