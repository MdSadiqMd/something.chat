import re
from dataclasses import dataclass

PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    ("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+", re.IGNORECASE), "[EMAIL]"),
    (
        "phone",
        re.compile(r"\b(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
        "[PHONE]",
    ),
    ("ssn", re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
    (
        "credit_card",
        re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"),
        "[CREDIT_CARD]",
    ),
    ("ip_address", re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[IP]"),
]


@dataclass
class RedactionResult:
    text: str
    summary: dict[str, int]
    had_discrepancy: bool = False


def redact(text: str) -> RedactionResult:
    result = text
    summary: dict[str, int] = {}

    for name, pattern, replacement in PATTERNS:
        matches = pattern.findall(result)
        if matches:
            summary[name] = len(matches)
            result = pattern.sub(replacement, result)

    return RedactionResult(text=result, summary=summary)


def check_discrepancy(
    original_summary: dict[str, int] | None,
    new_summary: dict[str, int],
) -> bool:
    """Return True if worker found PII not caught by SDK."""
    if original_summary is None:
        return bool(new_summary)
    for key, count in new_summary.items():
        if count > original_summary.get(key, 0):
            return True
    return False
