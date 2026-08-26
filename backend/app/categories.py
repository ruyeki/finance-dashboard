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
