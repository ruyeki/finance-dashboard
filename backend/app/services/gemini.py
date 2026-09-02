"""Gemini (Google AI Studio) client for transaction classification + paystub parsing.

Degrades gracefully: if GEMINI_API_KEY is unset, classification returns
"Uncategorized" and paystub parsing raises a clear error.
"""

import json
import logging
from functools import lru_cache

from app.categories import CATEGORIES
from app.config import settings

logger = logging.getLogger(__name__)


def is_enabled() -> bool:
    return bool(settings.gemini_api_key)


@lru_cache
def _client():
    # Cached so the client (and its underlying HTTP connection) isn't garbage
    # collected between creation and use — a temporary would raise
    # "Cannot send a request, as the client has been closed".
    from google import genai

    return genai.Client(api_key=settings.gemini_api_key)


CHUNK_SIZE = 40  # keep each response well under output-token limits


_NON_SPEND_LABELS = {"Uncategorized", "Transfer", "Income", "Investments"}


def _classify_chunk(descriptions: list[str]) -> list[str]:
    allowed = ", ".join(c for c in CATEGORIES if c not in _NON_SPEND_LABELS)
    numbered = "\n".join(f"{i}: {d}" for i, d in enumerate(descriptions))
    prompt = (
        "You are a personal-finance transaction classifier. "
        "Assign each transaction description to exactly one of these categories:\n"
        f"{allowed}\n\n"
        "Return a JSON array of objects like {\"i\": <index>, \"category\": <category>} "
        "for every input line. Use the closest category; if truly unclear use "
        "\"Uncategorized\".\n\nTransactions:\n" + numbered
    )
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


def classify_merchants(descriptions: list[str]) -> list[str]:
    """Map each merchant/description string to one of CATEGORIES.

    Processes in small chunks so large batches don't overflow the response.
    Returns "Uncategorized" for everything when Gemini is not configured.
    """
    if not descriptions:
        return []
    if not is_enabled():
        return ["Uncategorized"] * len(descriptions)

    out: list[str] = []
    for start in range(0, len(descriptions), CHUNK_SIZE):
        chunk = descriptions[start : start + CHUNK_SIZE]
        try:
            out.extend(_classify_chunk(chunk))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini classification failed for a chunk: %s", exc)
            out.extend(["Uncategorized"] * len(chunk))
    return out


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


REPORT_PROMPT = """You are a sharp, encouraging personal-finance analyst writing a
report for one person about their most recent pay period. You are given a JSON
object with the real figures for this period and the previous one, their
investment portfolio, and retirement-goal progress.

Write a concise, specific report. Rules:
- Use ONLY the numbers provided. Never invent figures. Round dollars sensibly.
- Be concrete: name actual categories and merchants and cite their amounts.
- Be honest but constructive. If they overspent, say so plainly, then help.
- Cut-back suggestions must target real categories/merchants from the data, with
  a realistic monthly-dollar impact.
- Keep each text field tight (1-4 sentences). No markdown, no preamble.

Return a JSON object with exactly these keys:
{
  "headline": "one punchy sentence summarizing the period",
  "spending": "2-4 sentences on where the money went, with amounts",
  "comparison": {
    "direction": "improved" | "worse" | "similar",
    "note": "1-2 sentences comparing spending to last period, with the numbers"
  },
  "wins": ["1-3 short positive observations, if any"],
  "cutbacks": [
    {"target": "category or merchant", "suggestion": "specific action", "monthly_impact": number}
  ],
  "portfolio": "2-3 sentences: total invested, how it moved vs the S&P 500 this period, and retirement-goal progress",
  "actions": ["2-3 concrete next steps"]
}

Here is the data:
"""


def analyze_finances(context: dict) -> dict:
    """Produce a structured finance report from a period's figures."""
    if not is_enabled():
        raise RuntimeError("GEMINI_API_KEY is not set; cannot generate reports.")
    resp = _client().models.generate_content(
        model=settings.gemini_model,
        contents=REPORT_PROMPT + json.dumps(context, default=str),
        config={"response_mime_type": "application/json"},
    )
    return json.loads(resp.text)


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
