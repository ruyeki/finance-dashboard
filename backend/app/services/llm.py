"""Local LLM client (Ollama) for transaction classification, paystub parsing,
and period reports.

Talks to an Ollama server (default http://localhost:11434) running a text model
(default qwen3:4b). No API key is needed — the model runs locally.

Degrades gracefully: classification falls back to "Uncategorized" if the model
is unreachable; report/paystub calls raise a clear error.
"""

import json
import logging
import re

import requests

from app.categories import CATEGORIES
from app.config import settings

logger = logging.getLogger(__name__)

CHUNK_SIZE = 40  # keep each response well under what a small model handles cleanly

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def is_enabled() -> bool:
    # The model is local; there's no key to gate on. Callers still use this to
    # decide whether to attempt a call — treat a configured host as enabled.
    return bool(settings.ollama_host and settings.ollama_model)


def _generate(prompt: str, *, fmt="json", think: bool = True, temperature: float = 0.0) -> str:
    """Call Ollama's /api/generate and return the response text.

    `fmt` is either "json" or a JSON-schema dict (Ollama structured outputs).
    Thinking defaults ON: qwen3 classifies and reasons far better with it, and
    Ollama returns clean output in `response` (reasoning goes to a separate
    `thinking` field). Turn it off only with a schema `fmt` — qwen3 emits garbage
    with think off under the plain "json" grammar, but a schema keeps it valid.

    Raises RuntimeError if the server can't be reached, so callers can surface a
    clear message instead of a bare ConnectionError.
    """
    try:
        resp = requests.post(
            f"{settings.ollama_host}/api/generate",
            json={
                "model": settings.ollama_model,
                "prompt": prompt,
                "stream": False,
                "format": fmt,
                "think": think,
                "options": {"temperature": temperature},
            },
            timeout=settings.ollama_timeout,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(
            f"Cannot reach the local model at {settings.ollama_host} "
            f"(model {settings.ollama_model}). Is Ollama running?"
        ) from exc
    return resp.json().get("response", "")


def _parse_json(text: str):
    """Parse model output into JSON, tolerating stray <think> blocks or prose
    around the JSON that a small model sometimes adds despite format=json."""
    cleaned = _THINK_RE.sub("", text).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Fall back to the first {...} object or [...] array in the text.
    for open_c, close_c in (("{", "}"), ("[", "]")):
        start = cleaned.find(open_c)
        end = cleaned.rfind(close_c)
        if start != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
    raise ValueError(f"Model did not return JSON: {cleaned[:200]!r}")


_NON_SPEND_LABELS = {"Uncategorized", "Transfer", "Income", "Investments"}


def _classify_chunk(descriptions: list[str]) -> list[str]:
    allowed = ", ".join(c for c in CATEGORIES if c not in _NON_SPEND_LABELS)
    numbered = "\n".join(f"{i}: {d}" for i, d in enumerate(descriptions))
    n = len(descriptions)
    prompt = (
        "You are a personal-finance transaction classifier. "
        "Assign each transaction to exactly one of these categories:\n"
        f"{allowed}\n\n"
        f"Return ONLY a JSON array of exactly {n} strings — one category per "
        "transaction, in the same order as the numbered list below. Example for "
        '3 inputs: ["Groceries", "Dining", "Transportation"]. Use the closest '
        'category; if truly unclear use "Uncategorized".\n\nTransactions:\n'
        + numbered
    )
    # A schema with an enum guarantees every returned string is a real category,
    # in order — the most reliable shape for a small model.
    schema = {"type": "array", "items": {"type": "string", "enum": list(CATEGORIES)}}
    data = _parse_json(_generate(prompt, fmt=schema))
    return _coerce_categories(data, descriptions)


def _coerce_categories(data, descriptions: list[str]) -> list[str]:
    """Map a model's (often loosely-shaped) JSON into one category per input.

    Small models return any of: a positional list of strings, a list of
    {"i","category"} objects, or a dict keyed by index or by description. Handle
    them all; anything unrecognised stays "Uncategorized".
    """
    result = ["Uncategorized"] * len(descriptions)
    valid = set(CATEGORIES)

    def put(idx, cat) -> None:
        if isinstance(cat, str) and cat in valid and isinstance(idx, int) and 0 <= idx < len(result):
            result[idx] = cat

    # A dict wrapping a single list (e.g. {"categories": [...]}) -> use the list.
    if isinstance(data, dict):
        inner = next((v for v in data.values() if isinstance(v, list)), None)
        if inner is not None:
            data = inner

    if isinstance(data, dict):
        # index->category, index->{"category":..}, or description->category.
        for k, v in data.items():
            cat = v.get("category") if isinstance(v, dict) else v
            try:
                put(int(k), cat)
            except (TypeError, ValueError):
                if k in descriptions:
                    put(descriptions.index(k), cat)
    elif isinstance(data, list):
        for pos, row in enumerate(data):
            if isinstance(row, str):
                put(pos, row)
            elif isinstance(row, dict):
                idx = row.get("i", row.get("index", pos))
                try:
                    idx = int(idx)
                except (TypeError, ValueError):
                    idx = pos
                put(idx, row.get("category") or row.get("cat"))
    return result


def classify_merchants(descriptions: list[str]) -> list[str]:
    """Map each merchant/description string to one of CATEGORIES.

    Processes in small chunks so large batches don't overflow the response.
    Returns "Uncategorized" for a chunk if the model fails or is unreachable.
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
            logger.warning("Local-model classification failed for a chunk: %s", exc)
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


REPORT_PROMPT = """You are a sharp, insightful personal-finance analyst writing a
detailed report for one person about their most recent pay period. You are given
a JSON object with the real figures for this period and the previous one, their
investment portfolio, and retirement-goal progress.

Write a thorough, specific, genuinely useful report. Go deep — the reader wants
real analysis, not a summary. Rules:
- Use ONLY the numbers provided. Never invent figures. Round dollars sensibly.
- Be concrete and exhaustive: name EVERY notable category and merchant and cite
  their amounts. Walk through where the money actually went, biggest first.
- Explain the "why" and the trade-offs, not just the "what". Point out patterns,
  surprises, and anything that moved a lot versus last period.
- Be honest but constructive. If they overspent, say so plainly, then help.
- Cut-back suggestions must target real categories/merchants from the data, each
  with a realistic monthly-dollar impact and a specific, actionable step.
- Write in full, flowing sentences with real detail. Do NOT be terse. No
  markdown, no preamble.

Return a JSON object with exactly these keys:
{
  "headline": "one punchy, specific sentence summarizing the period",
  "spending": "4-6 sentences walking through where the money went, category by
    category, with amounts — cover every notable line, not just the top one",
  "comparison": {
    "direction": "improved" | "worse" | "similar",
    "note": "3-5 sentences comparing this period to last, with the numbers and
      what drove the change"
  },
  "wins": ["at least 2-3 specific positive observations, each with the number behind it"],
  "cutbacks": [
    {"target": "category or merchant", "suggestion": "specific, actionable step", "monthly_impact": number}
  ],
  "portfolio": "4-6 sentences: total invested, how it moved vs the S&P 500 this
    period, allocation observations, and retirement-goal progress with the math",
  "actions": ["at least 3-4 concrete, prioritized next steps"]
}

Give at least 3 cutbacks and at least 3 actions. Here is the data:
"""


# Report shape, as a JSON schema. Pairing this with think-off keeps the output
# valid and fast (qwen3 needs a schema to stay coherent without thinking).
_REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "spending": {"type": "string"},
        "comparison": {
            "type": "object",
            "properties": {
                "direction": {"type": "string", "enum": ["improved", "worse", "similar"]},
                "note": {"type": "string"},
            },
            "required": ["direction", "note"],
        },
        "wins": {"type": "array", "items": {"type": "string"}, "minItems": 2},
        "cutbacks": {
            "type": "array",
            "minItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "target": {"type": "string"},
                    "suggestion": {"type": "string"},
                    "monthly_impact": {"type": "number"},
                },
                "required": ["target", "suggestion", "monthly_impact"],
            },
        },
        "portfolio": {"type": "string"},
        "actions": {"type": "array", "items": {"type": "string"}, "minItems": 3},
    },
    "required": [
        "headline", "spending", "comparison", "wins", "cutbacks", "portfolio", "actions",
    ],
}


def analyze_finances(context: dict) -> dict:
    """Produce a structured finance report from a period's figures.

    Runs with thinking ON for quality (think-off reports were too shallow); the
    schema still constrains the final shape so it parses reliably. This is slow
    on a small box — OLLAMA_TIMEOUT is sized for it.
    """
    text = _generate(
        REPORT_PROMPT + json.dumps(context, default=str),
        fmt=_REPORT_SCHEMA,
        think=True,
        temperature=0.5,
    )
    return _parse_json(text)


def parse_paystub(pdf_bytes: bytes) -> dict:
    """Extract a structured paycheck breakdown from a paystub PDF.

    qwen3 is text-only, so we extract the PDF text with pypdf first. A scanned
    (image-only) paystub yields no text and raises — there's no OCR here.
    """
    from io import BytesIO

    from pypdf import PdfReader

    reader = PdfReader(BytesIO(pdf_bytes))
    text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    if not text:
        raise RuntimeError(
            "No text found in this PDF. If it's a scanned image, the local "
            "model can't read it — upload a text-based paystub."
        )

    fields_desc = "\n".join(f"- {k}: {v}" for k, v in PAYSTUB_FIELDS.items())
    prompt = (
        "Extract the current-period pay breakdown from this paystub text. "
        "Return a single JSON object with exactly these keys:\n"
        f"{fields_desc}\n\n"
        "Use current-period amounts (not year-to-date). Numbers only for money "
        "fields (no $ or commas). If a field is absent, use 0 (or null for "
        "employer).\n\nPaystub text:\n" + text
    )
    return _parse_json(_generate(prompt))
