"""Live market prices via Yahoo Finance (no API key required).

Works for mutual funds (VTSAX…), money-market funds (VMFXX ~= $1), ETFs and
stocks. Mutual funds only reprice once daily at NAV; ETFs/stocks are intraday.
Prices are cached briefly to avoid hammering the endpoint.
"""

import logging
import time

import httpx

logger = logging.getLogger(__name__)

_HOSTS = [
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
]
_HEADERS = {"User-Agent": "Mozilla/5.0 (finance-dashboard)"}
_CACHE_TTL = 120  # seconds

# ticker -> (price, monotonic_timestamp)
_cache: dict[str, tuple[float, float]] = {}


def _fetch_one(ticker: str) -> float | None:
    for host in _HOSTS:
        try:
            resp = httpx.get(
                f"{host}/v8/finance/chart/{ticker}",
                params={"interval": "1d", "range": "1d"},
                headers=_HEADERS,
                timeout=10.0,
            )
            resp.raise_for_status()
            meta = resp.json()["chart"]["result"][0]["meta"]
            price = meta.get("regularMarketPrice")
            if price is not None:
                return float(price)
        except Exception as exc:  # noqa: BLE001
            logger.info("Price fetch failed for %s via %s: %s", ticker, host, exc)
    return None


def get_prices(tickers: list[str], use_cache: bool = True) -> dict[str, float]:
    """Return {ticker: price} for the tickers we can resolve."""
    out: dict[str, float] = {}
    now = time.monotonic()
    for t in {t.upper() for t in tickers if t}:
        if use_cache:
            cached = _cache.get(t)
            if cached and now - cached[1] < _CACHE_TTL:
                out[t] = cached[0]
                continue
        price = _fetch_one(t)
        if price is not None:
            _cache[t] = (price, now)
            out[t] = price
    return out


def get_price(ticker: str) -> float | None:
    return get_prices([ticker]).get(ticker.upper())
