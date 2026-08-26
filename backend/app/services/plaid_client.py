"""Thin wrapper around plaid-python (v43) for the flows we use."""

from functools import lru_cache

import plaid
from plaid.api import plaid_api
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import (
    ItemPublicTokenExchangeRequest,
)
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.investments_holdings_get_request import (
    InvestmentsHoldingsGetRequest,
)
from plaid.model.transactions_sync_request import TransactionsSyncRequest

from app.config import settings

_ENV_HOSTS = {
    "sandbox": plaid.Environment.Sandbox,
    "production": plaid.Environment.Production,
}


def is_configured() -> bool:
    return bool(settings.plaid_client_id and settings.plaid_secret)


@lru_cache
def get_client() -> plaid_api.PlaidApi:
    configuration = plaid.Configuration(
        host=_ENV_HOSTS.get(settings.plaid_env, plaid.Environment.Sandbox),
        api_key={
            "clientId": settings.plaid_client_id,
            "secret": settings.plaid_secret,
        },
    )
    return plaid_api.PlaidApi(plaid.ApiClient(configuration))


def create_link_token(user_id: str = "finance-dashboard-user") -> str:
    products = [Products(p) for p in settings.plaid_products_list]
    country_codes = [CountryCode(c) for c in settings.plaid_country_codes_list]
    req = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id=user_id),
        client_name="Finance Dashboard",
        products=products,
        country_codes=country_codes,
        language="en",
    )
    if settings.plaid_webhook_url:
        req.webhook = settings.plaid_webhook_url
    return get_client().link_token_create(req).link_token


def exchange_public_token(public_token: str) -> tuple[str, str]:
    """Returns (access_token, item_id)."""
    resp = get_client().item_public_token_exchange(
        ItemPublicTokenExchangeRequest(public_token=public_token)
    )
    return resp.access_token, resp.item_id


def get_accounts(access_token: str) -> list:
    resp = get_client().accounts_get(AccountsGetRequest(access_token=access_token))
    return resp.accounts


def get_institution_name(access_token: str) -> str:
    """Best-effort institution name from the item's accounts response."""
    resp = get_client().accounts_get(AccountsGetRequest(access_token=access_token))
    item = resp.item
    return getattr(item, "institution_name", None) or "Connected institution"


def sync_transactions(access_token: str, cursor: str | None) -> dict:
    """Page through /transactions/sync, returning combined results."""
    added, modified, removed = [], [], []
    has_more = True
    next_cursor = cursor
    while has_more:
        req = TransactionsSyncRequest(access_token=access_token)
        if next_cursor:
            req.cursor = next_cursor
        resp = get_client().transactions_sync(req)
        added.extend(resp.added)
        modified.extend(resp.modified)
        removed.extend(resp.removed)
        has_more = resp.has_more
        next_cursor = resp.next_cursor
    return {
        "added": added,
        "modified": modified,
        "removed": removed,
        "next_cursor": next_cursor,
    }


def get_holdings(access_token: str) -> dict:
    """Returns {'holdings': [...], 'securities': [...], 'accounts': [...]}."""
    resp = get_client().investments_holdings_get(
        InvestmentsHoldingsGetRequest(access_token=access_token)
    )
    return {
        "holdings": resp.holdings,
        "securities": resp.securities,
        "accounts": resp.accounts,
    }
