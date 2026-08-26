"""SimpleFIN Bridge client: claim a setup token, then fetch accounts/transactions.

SimpleFIN is a minimalist read-only protocol. A one-time setup token is claimed
for a durable Access URL (with embedded basic-auth), which is then used to GET
/accounts. See https://www.simplefin.org/protocol.html
"""

import base64
import datetime as dt
from urllib.parse import urlsplit

import httpx

TIMEOUT = httpx.Timeout(30.0)


def claim_setup_token(setup_token: str) -> str:
    """Base64-decode the setup token to a claim URL, POST it, return the Access URL."""
    claim_url = base64.b64decode(setup_token.strip()).decode().strip()
    resp = httpx.post(claim_url, timeout=TIMEOUT)
    resp.raise_for_status()
    access_url = resp.text.strip()
    if not access_url.startswith("http"):
        raise ValueError("SimpleFIN claim did not return an access URL")
    return access_url


def _split_access_url(access_url: str) -> tuple[str, tuple[str, str]]:
    """Return (base_url_without_creds, (username, password))."""
    parts = urlsplit(access_url)
    host = parts.hostname or ""
    if parts.port:
        host = f"{host}:{parts.port}"
    base = f"{parts.scheme}://{host}{parts.path}"
    return base, (parts.username or "", parts.password or "")


def fetch_accounts(
    access_url: str,
    start_date: dt.date | None = None,
    pending: bool = True,
) -> dict:
    base, auth = _split_access_url(access_url)
    params: dict[str, str | int] = {}
    if start_date:
        params["start-date"] = int(
            dt.datetime(start_date.year, start_date.month, start_date.day).timestamp()
        )
    if pending:
        params["pending"] = 1
    resp = httpx.get(f"{base}/accounts", params=params, auth=auth, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


DEMO_SETUP_TOKEN = (
    "aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vZGVtbw=="
)
