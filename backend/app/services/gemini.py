"""Gemini (Google AI Studio) client for transaction classification + paystub parsing.

Degrades gracefully: if GEMINI_API_KEY is unset, classification returns
"Uncategorized" and paystub parsing raises a clear error.
"""

import json
import logging

from app.categories import CATEGORIES
from app.config import settings

logger = logging.getLogger(__name__)


def is_enabled() -> bool:
    return bool(settings.gemini_api_key)


def _client():
    from google import genai

    return genai.Client(api_key=settings.gemini_api_key)


def classify_merchants(descriptions: list[str]) -> list[str]:
    """Map each merchant/description string to one of CATEGORIES.

    Returns "Uncategorized" for everything when Gemini is not configured.
    """
    if not descriptions:
        return []
    if not is_enabled():
        return ["Uncategorized"] * len(descriptions)

    allowed = ", ".join(c for c in CATEGORIES if c != "Uncategorized")
    numbered = "\n".join(f"{i}: {d}" for i, d in enumerate(descriptions))
    prompt = (
        "You are a personal-finance transaction classifier. "
        "Assign each transaction description to exactly one of these categories:\n"
        f"{allowed}\n\n"
        "Return a JSON array of objects like {\"i\": <index>, \"category\": <category>} "
        "for every input line. Use the closest category; if truly unclear use "
        "\"Uncategorized\".\n\nTransactions:\n" + numbered
    )

    try:
        resp = _client().models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        data = json.loads(resp.text)
        result = ["Uncategorized"] * len(descriptions)
        valid = set(CATEGORIES)
        for row in data:
            i = int(row["i"])
            cat = row["category"]
            if 0 <= i < len(result) and cat in valid:
                result[i] = cat
        return result
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gemini classification failed: %s", exc)
        return ["Uncategorized"] * len(descriptions)


PAYSTUB_FIELDS = {
    "pay_date": "ISO date (YYYY-MM-DD) this paycheck was paid",
    "gross": "gross pay for this period (number)",
    "federal_tax": "federal income tax withheld this period",
    "state_tax": "state income tax withheld this period",
    "social_security": "Social Security / OASDI withheld this period",
    "medicare": "Medicare withheld this period",
    "insurance": "sum of health/dental/vision insurance deductions this period",
    "retirement_401k": "401(k) / retirement contribution this period",
    "net": "net (take-home) pay this period",
    "employer": "employer name (string) or null",
}


def parse_paystub(pdf_bytes: bytes) -> dict:
    """Extract a structured paycheck breakdown from a paystub PDF."""
    if not is_enabled():
        raise RuntimeError("GEMINI_API_KEY is not set; cannot parse paystubs.")

    from google.genai import types

    fields_desc = "\n".join(f"- {k}: {v}" for k, v in PAYSTUB_FIELDS.items())
    prompt = (
        "Extract the current-period pay breakdown from this paystub. "
        "Return a single JSON object with exactly these keys:\n"
        f"{fields_desc}\n\n"
        "Use current-period amounts (not year-to-date). Numbers only for money "
        "fields (no $ or commas). If a field is absent, use 0 (or null for employer)."
    )
    part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
    resp = _client().models.generate_content(
        model=settings.gemini_model,
        contents=[prompt, part],
        config={"response_mime_type": "application/json"},
    )
    return json.loads(resp.text)
