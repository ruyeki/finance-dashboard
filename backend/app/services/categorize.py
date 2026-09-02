"""Categorization pipeline: rules -> Plaid category -> Gemini fallback."""

import re

from sqlmodel import Session, select

from app.categories import map_plaid_category
from app.models import CategoryRule, CategorySource, MatchType, Transaction
from app.services import gemini


# Descriptions that indicate money moving between accounts / people rather than
# real spending. These get flagged is_transfer and excluded from spending totals.
TRANSFER_PATTERNS = [
    "zelle",
    "venmo",
    "cash app",
    "cashapp",
    "paypal transfer",
    "mobile banking payment",
    "online banking payment",
    "internet banking payment",
    "bill pay",
    "billpay",
    "autopay",
    "auto pay",
    "e-payment",
    "epayment",
    "web payment",
    "online payment",
    "credit card payment",
    "cardmember payment",
    "card payment",
    "payment thank you",
    "payment - thank you",
    "wire transfer",
    "transfer to",
    "transfer from",
    "xfer",
    "atm withdrawal",
    "atm cash",
    "cash withdrawal",
    "withdrawal atm",
    "to savings",
    "to checking",
    "recurring transfer",
    "overdraft",
]


def detect_transfer(text: str) -> bool:
    """Heuristic: does this description look like an account transfer / payment
    rather than real spending? (Used when the aggregator gives no category.)"""
    t = (text or "").lower()
    if any(p in t for p in TRANSFER_PATTERNS):
        return True
    # "ATM" as a standalone token (avoid matching words that merely contain it).
    if " atm" in f" {t}" or t.startswith("atm"):
        return True
    return False


# Only credit-card payoffs are auto-excluded from spending: the purchases are
# already counted on the card, so counting the payment too would double-count.
# Everything else (Zelle, ATM, bank transfers) is treated as real spending.
CARD_PAYMENT_PATTERNS = [
    "payment thank you",
    "payment - thank you",
    "cardmember",
    "credit card payment",
    "credit card bill",
    "creditcard payment",
    "card payment",
    "cc payment",
]


def detect_card_payment(text: str) -> bool:
    t = (text or "").lower()
    return any(p in t for p in CARD_PAYMENT_PATTERNS)


# Real income: payroll/paycheck, plus interest & dividends. The employer name
# is configurable (Setting "income_keywords") since it varies per user.
INCOME_PATTERNS = [
    "payroll",
    "gusto",
    "direct dep",
    "dir dep",
    "salary",
    "dividend",
    "interest paid",
    "interest income",
    "irs treas",
    "tax ref",
]

# Money moving between the user's own accounts or received P2P — not income.
TRANSFER_IN_PATTERNS = [
    "payment from checking",
    "payment from savings",
    "transfer from",
    "internet transfer",
    "online banking transfer",
    "zelle transfer from",
    "zelle from",
    "goldman sachs",
    "electronic funds transfer received",
    "funds transfer received",
]


def get_income_keywords(session: Session) -> list[str]:
    from app.models import Setting

    row = session.get(Setting, "income_keywords")
    if not row or not row.value:
        return []
    return [k.strip().lower() for k in row.value.split(",") if k.strip()]


def detect_income(text: str, extra_keywords: list[str] = ()) -> bool:
    t = (text or "").lower()
    if any(p in t for p in INCOME_PATTERNS):
        return True
    return any(k and k in t for k in extra_keywords)


def detect_transfer_in(text: str) -> bool:
    t = (text or "").lower()
    if any(p in t for p in TRANSFER_IN_PATTERNS):
        return True
    return " atm" in f" {t}" or t.startswith("atm")


def classify_inflow(
    text: str, income_keywords: list[str]
) -> tuple[str, "CategorySource", bool, bool]:
    """For a money-in transaction, return (category, source, is_income, is_transfer)."""
    if detect_income(text, income_keywords):
        return "Income", CategorySource.rule, True, False
    if detect_transfer_in(text):
        return "Transfer", CategorySource.rule, False, True
    # Unknown credit (refund, misc) — neither income nor spending.
    return "Uncategorized", CategorySource.uncategorized, False, False


def _rule_matches(rule: CategoryRule, text: str) -> bool:
    hay = text.lower()
    needle = rule.pattern.lower()
    if rule.match_type == MatchType.exact:
        return hay == needle
    if rule.match_type == MatchType.regex:
        try:
            return re.search(rule.pattern, text, re.IGNORECASE) is not None
        except re.error:
            return False
    return needle in hay  # contains


def apply_rules(session: Session, text: str) -> str | None:
    rules = session.exec(select(CategoryRule)).all()
    for rule in rules:
        if _rule_matches(rule, text):
            return rule.category
    return None


def categorize_from_plaid(
    session: Session,
    text: str,
    plaid_primary: str | None,
    plaid_detailed: str | None,
) -> tuple[str, CategorySource]:
    """Return (category, source) using rules then the Plaid category.

    Leaves Gemini for a separate batch pass (see categorize_uncategorized).
    """
    rule_cat = apply_rules(session, text)
    if rule_cat:
        return rule_cat, CategorySource.rule

    plaid_cat = map_plaid_category(plaid_primary, plaid_detailed)
    if plaid_cat != "Uncategorized":
        return plaid_cat, CategorySource.plaid

    return "Uncategorized", CategorySource.uncategorized


def categorize_uncategorized(session: Session, limit: int = 1000) -> int:
    """Batch-classify remaining uncategorized transactions with Gemini.

    No-op (returns 0) when Gemini isn't configured. Returns count updated.
    """
    if not gemini.is_enabled():
        return 0

    txns = session.exec(
        select(Transaction)
        .where(Transaction.category == "Uncategorized")
        .where(Transaction.amount > 0)  # only classify spending; inflows handled separately
        .limit(limit)
    ).all()
    if not txns:
        return 0

    descriptions = [t.merchant_name or t.raw_name for t in txns]
    categories = gemini.classify_merchants(descriptions)

    updated = 0
    for txn, cat in zip(txns, categories):
        if cat and cat != "Uncategorized":
            txn.category = cat
            txn.category_source = CategorySource.ai
            session.add(txn)
            updated += 1
    session.commit()
    return updated


def reclassify_all(session: Session) -> dict:
    """Re-run transfer detection + rules over all non-manual transactions.

    Safe to run anytime (after adding rules, a Gemini key, or new heuristics).
    Never overrides a manual categorization.
    """
    txns = session.exec(select(Transaction)).all()
    income_keywords = get_income_keywords(session)
    card_payments = 0
    income = 0
    ruled = 0
    for txn in txns:
        if txn.category_source == CategorySource.manual:
            continue
        name = txn.merchant_name or txn.raw_name or ""

        # Money in: paycheck / interest = income; internal moves = transfer; else neutral.
        if txn.amount < 0:
            cat, src, is_inc, is_xfer = classify_inflow(name, income_keywords)
            txn.category = cat
            txn.category_source = src
            txn.is_income = is_inc
            txn.is_transfer = is_xfer
            session.add(txn)
            if is_inc:
                income += 1
            continue

        if detect_transfer(name):
            txn.category = "Transfer"
            txn.category_source = CategorySource.rule
            txn.is_transfer = True
            txn.is_income = False
            session.add(txn)
            card_payments += 1
            continue
        # Not a transfer: it counts as spending. Clear any stale transfer flag
        # and reset auto-set categories so Gemini/rules can reclassify.
        txn.is_transfer = False
        if txn.category_source in (CategorySource.rule, CategorySource.uncategorized) and txn.category in ("Transfer", "Uncategorized"):
            txn.category = "Uncategorized"
            txn.category_source = CategorySource.uncategorized
        rule_cat = apply_rules(session, name)
        if rule_cat:
            txn.category = rule_cat
            txn.category_source = CategorySource.rule
            ruled += 1
        session.add(txn)
    session.commit()
    ai = categorize_uncategorized(session)
    return {
        "income": income,
        "card_payments_excluded": card_payments,
        "ruled": ruled,
        "ai_categorized": ai,
    }


def add_rule_from_correction(
    session: Session, transaction: Transaction, category: str
) -> None:
    """When the user re-categorizes a transaction, remember it as a rule."""
    pattern = (transaction.merchant_name or transaction.raw_name or "").strip()
    if not pattern:
        return
    existing = session.exec(
        select(CategoryRule).where(
            CategoryRule.pattern == pattern,
            CategoryRule.match_type == MatchType.contains,
        )
    ).first()
    if existing:
        existing.category = category
        session.add(existing)
    else:
        session.add(
            CategoryRule(
                match_type=MatchType.contains, pattern=pattern, category=category
            )
        )
    session.commit()
