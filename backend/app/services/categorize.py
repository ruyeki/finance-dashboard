"""Categorization pipeline: rules -> Plaid category -> Gemini fallback."""

import re

from sqlmodel import Session, select

from app.categories import map_plaid_category
from app.models import CategoryRule, CategorySource, MatchType, Transaction
from app.services import gemini


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


def categorize_uncategorized(session: Session, limit: int = 200) -> int:
    """Batch-classify remaining uncategorized transactions with Gemini.

    No-op (returns 0) when Gemini isn't configured. Returns count updated.
    """
    if not gemini.is_enabled():
        return 0

    txns = session.exec(
        select(Transaction)
        .where(Transaction.category == "Uncategorized")
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
