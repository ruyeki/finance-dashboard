"""The fixed set of spending categories and the Plaid -> app category mapping."""

CATEGORIES: list[str] = [
    "Groceries",
    "Dining & Takeout",
    "Coffee & Snacks",
    "Transportation",
    "Gas & Fuel",
    "Shopping",
    "Clothing",
    "Entertainment",
    "Subscriptions",
    "Health & Fitness",
    "Housing & Rent",
    "Utilities",
    "Insurance",
    "Travel",
    "Personal Care",
    "Education",
    "Gifts & Donations",
    "Fees & Charges",
    "Taxes",
    "Income",
    "Transfer",
    "Investments",
    "Uncategorized",
]

# Plaid Personal Finance Category (primary) -> our category.
PLAID_PRIMARY_MAP: dict[str, str] = {
    "INCOME": "Income",
    "TRANSFER_IN": "Transfer",
    "TRANSFER_OUT": "Transfer",
    "LOAN_PAYMENTS": "Fees & Charges",
    "BANK_FEES": "Fees & Charges",
    "ENTERTAINMENT": "Entertainment",
    "FOOD_AND_DRINK": "Dining & Takeout",
    "GENERAL_MERCHANDISE": "Shopping",
    "HOME_IMPROVEMENT": "Shopping",
    "MEDICAL": "Health & Fitness",
    "PERSONAL_CARE": "Personal Care",
    "GENERAL_SERVICES": "Fees & Charges",
    "GOVERNMENT_AND_NON_PROFIT": "Gifts & Donations",
    "TRANSPORTATION": "Transportation",
    "TRAVEL": "Travel",
    "RENT_AND_UTILITIES": "Utilities",
}

# Plaid detailed category -> our category (overrides primary when matched).
PLAID_DETAILED_MAP: dict[str, str] = {
    "FOOD_AND_DRINK_GROCERIES": "Groceries",
    "FOOD_AND_DRINK_COFFEE": "Coffee & Snacks",
    "FOOD_AND_DRINK_FAST_FOOD": "Dining & Takeout",
    "FOOD_AND_DRINK_RESTAURANT": "Dining & Takeout",
    "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES": "Clothing",
    "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES": "Shopping",
    "TRANSPORTATION_GAS": "Gas & Fuel",
    "TRANSPORTATION_PUBLIC_TRANSIT": "Transportation",
    "RENT_AND_UTILITIES_RENT": "Housing & Rent",
    "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY": "Utilities",
    "RENT_AND_UTILITIES_INTERNET_AND_CABLE": "Utilities",
    "RENT_AND_UTILITIES_TELEPHONE": "Utilities",
    "ENTERTAINMENT_TV_AND_MOVIES": "Subscriptions",
    "GENERAL_SERVICES_INSURANCE": "Insurance",
    "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS": "Health & Fitness",
}


def map_plaid_category(primary: str | None, detailed: str | None) -> str:
    if detailed and detailed in PLAID_DETAILED_MAP:
        return PLAID_DETAILED_MAP[detailed]
    if primary and primary in PLAID_PRIMARY_MAP:
        return PLAID_PRIMARY_MAP[primary]
    return "Uncategorized"


# --- Tiers -----------------------------------------------------------------
#
# Every spending category belongs to exactly one tier. This is the spine of the
# dashboard: the flow diagram, the pace chart and the "discretionary left"
# figure are all cut by tier rather than by category.
#
# "excluded" means the category is not spending you chose to do this period:
# income, moving money between your own accounts, buying securities, and the
# two pass-through categories (Taxes, Fees & Charges). Payroll tax is already
# represented as "withheld" on the gross-pay side of the flow, so counting it
# again here would double-count it.

FIXED = "fixed"
ESSENTIAL = "essential"
DISCRETIONARY = "discretionary"
EXCLUDED = "excluded"

TIERS: dict[str, str] = {
    # Committed, roughly the same every period.
    "Housing & Rent": FIXED,
    "Utilities": FIXED,
    "Insurance": FIXED,
    "Subscriptions": FIXED,
    "Health & Fitness": FIXED,
    # Necessary, but the amount moves with behaviour.
    "Groceries": ESSENTIAL,
    "Transportation": ESSENTIAL,
    "Gas & Fuel": ESSENTIAL,
    # Not in the design's tier lists. Tuition and course fees read as a
    # committed cost closer to essentials than to a discretionary choice.
    "Education": ESSENTIAL,
    # Chosen. This is the branch the dashboard is built to scrutinise.
    "Dining & Takeout": DISCRETIONARY,
    "Coffee & Snacks": DISCRETIONARY,
    "Shopping": DISCRETIONARY,
    "Clothing": DISCRETIONARY,
    "Entertainment": DISCRETIONARY,
    "Travel": DISCRETIONARY,
    "Personal Care": DISCRETIONARY,
    "Gifts & Donations": DISCRETIONARY,
    # Also not in the design's tier lists. Unclassified spend sits in
    # discretionary on purpose: parking it in "fixed" would let real spending
    # hide inside the branch nobody looks at.
    "Uncategorized": DISCRETIONARY,
    # Not spending.
    "Income": EXCLUDED,
    "Transfer": EXCLUDED,
    "Investments": EXCLUDED,
    "Taxes": EXCLUDED,
    "Fees & Charges": EXCLUDED,
}

# A category with no tier would silently vanish from every tier-cut view, so
# fail loudly at import instead of at render time.
_missing = [c for c in CATEGORIES if c not in TIERS]
if _missing:  # pragma: no cover - guards a developer mistake, not user input
    raise RuntimeError(f"Categories missing a tier in TIERS: {_missing}")

SPEND_TIERS = (FIXED, ESSENTIAL, DISCRETIONARY)

TIER_LABELS: dict[str, str] = {
    FIXED: "Fixed bills",
    ESSENTIAL: "Essentials",
    DISCRETIONARY: "Discretionary",
}


def tier_for(category: str) -> str:
    """Tier of a category. Unknown categories count as discretionary, matching
    how `Uncategorized` is treated — visible rather than hidden."""
    return TIERS.get(category, DISCRETIONARY)
