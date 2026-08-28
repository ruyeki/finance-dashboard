"""Value investment holdings from live prices, and manage the 401k plan."""

import datetime as dt
import logging

from sqlmodel import Session, select

from app.models import Account, AccountType, BalanceSnapshot, Holding
from app.services import payperiods, prices

logger = logging.getLogger(__name__)

INVESTMENT_TYPES = [AccountType.brokerage, AccountType.roth, AccountType._401k]
# Money-market / settlement funds hold a stable $1 NAV; Yahoo sometimes lacks them.
MONEY_MARKET = {"VMFXX", "SPAXX", "FDRXX", "SWVXX", "VMRXX", "FZFXX"}

FUND_NAMES = {
    "VTSAX": "Vanguard Total Stock Market",
    "VTMGX": "Vanguard Developed Markets",
    "VEMAX": "Vanguard Emerging Markets",
    "VGSLX": "Vanguard Real Estate",
    "VBTLX": "Vanguard Total Bond Market",
    "VTABX": "Vanguard Total Intl Bond",
    "VMFXX": "Vanguard Federal Money Market",
}

# The user's 401k: (ticker, current value $, contribution allocation %).
K401_FUNDS = [
    ("VTSAX", 4069.00, 53.7),
    ("VTMGX", 1812.00, 24.1),
    ("VEMAX", 915.00, 12.1),
    ("VGSLX", 376.89, 5.1),
    ("VBTLX", 303.22, 4.0),
    ("VTABX", 75.65, 1.0),
    ("VMFXX", 0.36, 0.0),
]
K401_CONTRIBUTION = 566.67  # per pay period: $425 employee + $141.67 employer (4%)


def _price_for(ticker: str | None, price_map: dict[str, float]) -> float | None:
    if not ticker:
        return None
    t = ticker.upper()
    if t in price_map:
        return price_map[t]
    if t in MONEY_MARKET:
        return 1.0
    return None


def _snapshot(session: Session, account_id: int, balance: float) -> None:
    today = dt.date.today()
    existing = session.exec(
        select(BalanceSnapshot).where(
            BalanceSnapshot.account_id == account_id,
            BalanceSnapshot.date == today,
        )
    ).first()
    if existing:
        existing.balance = balance
        session.add(existing)
    else:
        session.add(BalanceSnapshot(account_id=account_id, date=today, balance=balance))


def revalue(session: Session, types: list[AccountType] | None = None) -> dict:
    """Reprice holdings for the given account types and roll up account balances."""
    types = types or INVESTMENT_TYPES
    accounts = session.exec(select(Account).where(Account.type.in_(types))).all()
    acct_ids = [a.id for a in accounts]
    if not acct_ids:
        return {"accounts": 0, "holdings": 0}

    holdings = session.exec(
        select(Holding).where(Holding.account_id.in_(acct_ids))
    ).all()
    tickers = [h.ticker for h in holdings if h.ticker]
    price_map = prices.get_prices(tickers)

    priced = 0
    today = dt.date.today()
    for h in holdings:
        p = _price_for(h.ticker, price_map)
        if p is not None:
            h.price = p
            h.value = round(h.quantity * p, 2)
            h.as_of = today
            session.add(h)
            priced += 1

    updated_accounts = 0
    for a in accounts:
        acct_holdings = [h for h in holdings if h.account_id == a.id]
        if not acct_holdings:
            continue
        total = round(sum(h.value for h in acct_holdings), 2)
        a.current_balance = total
        a.updated_at = dt.datetime.now(dt.timezone.utc)
        session.add(a)
        _snapshot(session, a.id, total)
        updated_accounts += 1

    session.commit()
    return {"accounts": updated_accounts, "holdings": priced}


def apply_contribution(session: Session, account: Account) -> dict:
    """Add shares to each holding per its target_pct, at current prices."""
    if account.contribution_per_period <= 0:
        return {"invested": 0.0, "holdings": 0}
    holdings = session.exec(
        select(Holding).where(Holding.account_id == account.id)
    ).all()
    tickers = [h.ticker for h in holdings if h.ticker]
    price_map = prices.get_prices(tickers)

    invested = 0.0
    n = 0
    for h in holdings:
        if not h.target_pct:
            continue
        dollars = account.contribution_per_period * (h.target_pct / 100.0)
        p = _price_for(h.ticker, price_map) or h.price
        if p:
            h.quantity = round(h.quantity + dollars / p, 6)
            session.add(h)
            invested += dollars
            n += 1
    session.commit()
    revalue(session, [account.type])
    return {"invested": round(invested, 2), "holdings": n}


def apply_scheduled_contributions(session: Session) -> dict:
    """On paydays, auto-invest into any account with a contribution plan."""
    cadence, anchor = payperiods.get_pay_config(session)
    today = dt.date.today()
    start, _ = payperiods.period_for_date(today, cadence, anchor)
    if start != today:
        return {"applied": 0}  # not a payday
    accounts = session.exec(
        select(Account).where(Account.contribution_per_period > 0)
    ).all()
    total = 0.0
    for a in accounts:
        r = apply_contribution(session, a)
        total += r["invested"]
    return {"applied": len(accounts), "invested": round(total, 2)}


TYPE_LABELS = {
    AccountType._401k: "401(k)",
    AccountType.roth: "Roth IRA",
    AccountType.brokerage: "Brokerage",
}


def stocks_overview(session: Session) -> dict:
    """Per-investment-account holdings, live values, allocation, contributions,
    and combined value history."""
    accounts = session.exec(
        select(Account).where(Account.type.in_(INVESTMENT_TYPES))
    ).all()

    out_accounts = []
    total = 0.0
    for a in accounts:
        hs = session.exec(
            select(Holding).where(Holding.account_id == a.id)
        ).all()
        hs.sort(key=lambda h: h.value, reverse=True)
        val = round(sum(h.value for h in hs), 2)
        total += val
        holdings_out = [
            {
                "ticker": h.ticker,
                "name": h.name or h.ticker,
                "shares": round(h.quantity, 4),
                "price": h.price,
                "value": round(h.value, 2),
                "pct": round(100 * h.value / val, 1) if val else 0,
                "target_pct": h.target_pct,
            }
            for h in hs
        ]
        contributions = []
        if a.contribution_per_period > 0:
            for h in hs:
                if h.target_pct:
                    contributions.append(
                        {
                            "ticker": h.ticker,
                            "name": h.name or h.ticker,
                            "dollars": round(a.contribution_per_period * h.target_pct / 100, 2),
                            "pct": h.target_pct,
                        }
                    )
        out_accounts.append(
            {
                "id": a.id,
                "name": a.name,
                "type": a.type.value,
                "type_label": TYPE_LABELS.get(a.type, a.type.value),
                "value": val,
                "holdings": holdings_out,
                "contribution_per_period": a.contribution_per_period,
                "contributions": contributions,
            }
        )

    out_accounts.sort(key=lambda x: x["value"], reverse=True)

    # Combined investment value over time from daily snapshots.
    acct_ids = [a.id for a in accounts]
    history: list[dict] = []
    if acct_ids:
        rows = session.exec(
            select(BalanceSnapshot.date, BalanceSnapshot.balance).where(
                BalanceSnapshot.account_id.in_(acct_ids)
            )
        ).all()
        by_date: dict[dt.date, float] = {}
        for d, b in rows:
            by_date[d] = by_date.get(d, 0.0) + b
        history = [
            {"date": d.isoformat(), "value": round(v, 2)} for d, v in sorted(by_date.items())
        ]

    return {"accounts": out_accounts, "total": round(total, 2), "history": history}


BENCHMARK = "^GSPC"  # S&P 500 index


def portfolio_history(
    session: Session, types: list[AccountType] | None = None, rng: str = "6mo"
) -> dict:
    """Reconstruct portfolio value over time from *current* holdings valued at
    historical prices, alongside an S&P 500 line normalized to the same start.

    Uses current share counts for all past dates (a back-test of today's
    holdings), which gives a real growth curve without waiting for snapshots.
    """
    types = types or INVESTMENT_TYPES
    accounts = session.exec(select(Account).where(Account.type.in_(types))).all()
    acct_ids = [a.id for a in accounts]
    if not acct_ids:
        return {"series": [], "portfolio_return": None, "sp500_return": None}

    hs = session.exec(select(Holding).where(Holding.account_id.in_(acct_ids))).all()
    tickers = [h.ticker for h in hs if h.ticker and h.ticker.upper() not in MONEY_MARKET]
    hist = prices.get_history(tickers + [BENCHMARK], rng)
    bench = hist.get(BENCHMARK, {})
    if not bench:
        return {"series": [], "portfolio_return": None, "sp500_return": None}

    dates = sorted(bench.keys())
    last_price: dict[str, float] = {}
    series: list[dict] = []
    for d in dates:
        total = 0.0
        for h in hs:
            if not h.ticker:
                continue
            t = h.ticker.upper()
            if t in MONEY_MARKET:
                p = 1.0
            else:
                tmap = hist.get(t, {})
                if d in tmap:
                    last_price[t] = tmap[d]
                p = last_price.get(t)
            if p is not None:
                total += h.quantity * p
        series.append({"date": d, "portfolio": round(total, 2), "_sp": bench[d]})

    # Index the S&P line to the portfolio's starting dollar value.
    start_val = series[0]["portfolio"]
    sp0 = series[0]["_sp"] or 1.0
    for pt in series:
        pt["sp500"] = round(start_val * pt["_sp"] / sp0, 2)
        del pt["_sp"]

    pv0, pvN = series[0]["portfolio"], series[-1]["portfolio"]
    port_ret = round(100 * (pvN - pv0) / pv0, 2) if pv0 else None
    sp_ret = round(100 * (bench[dates[-1]] - sp0) / sp0, 2) if sp0 else None
    return {
        "series": series,
        "portfolio_return": port_ret,
        "sp500_return": sp_ret,
        "current": pvN,
    }


def seed_401k(session: Session) -> dict:
    """Create (or reset) the Guideline 401k as a holdings-based account."""
    account = session.exec(
        select(Account).where(
            Account.type == AccountType._401k, Account.is_manual == True  # noqa: E712
        )
    ).first()
    if not account:
        account = Account(
            name="Guideline 401(k)",
            institution="Guideline",
            type=AccountType._401k,
            is_manual=True,
        )
        session.add(account)
        session.commit()
        session.refresh(account)

    # Clear any existing holdings, then rebuild from the given values.
    for h in session.exec(select(Holding).where(Holding.account_id == account.id)).all():
        session.delete(h)
    account.contribution_per_period = K401_CONTRIBUTION

    price_map = prices.get_prices([f[0] for f in K401_FUNDS])
    total = 0.0
    for ticker, value, pct in K401_FUNDS:
        p = _price_for(ticker, price_map)
        shares = round(value / p, 6) if p else 0.0
        session.add(
            Holding(
                account_id=account.id,
                ticker=ticker,
                name=FUND_NAMES.get(ticker, ticker),
                quantity=shares,
                price=p,
                value=round(value, 2),
                target_pct=pct,
            )
        )
        total += value
    account.current_balance = round(total, 2)
    session.add(account)
    session.commit()
    _snapshot(session, account.id, account.current_balance)
    session.commit()
    return {"account_id": account.id, "value": round(total, 2)}
