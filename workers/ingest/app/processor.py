import json
import logging

from .db import upsert_inference_log
from .redact import check_discrepancy, redact

logger = logging.getLogger(__name__)

# Model price table — USD per 1k tokens (input / output).
_PRICE_TABLE: dict[str, dict[str, float]] = {
    # OpenAI — developers.openai.com/api/docs/models
    "gpt-5.5": {"input": 0.005, "output": 0.030},
    "gpt-5.4": {"input": 0.0025, "output": 0.015},
    "gpt-5.4-mini": {"input": 0.00075, "output": 0.0045},
    "gpt-5.4-nano": {"input": 0.00020, "output": 0.0012},
    # Anthropic — platform.claude.com/docs/en/about-claude/pricing
    "claude-opus-4-7": {"input": 0.005, "output": 0.025},
    "claude-sonnet-4-6": {"input": 0.003, "output": 0.015},
    "claude-haiku-4-5": {"input": 0.001, "output": 0.005},
    "claude-haiku-4-5-20251001": {"input": 0.001, "output": 0.005},
    # Google — ai.google.dev/pricing
    "gemini-2.5-pro": {"input": 0.00125, "output": 0.010},
    "gemini-2.5-flash": {"input": 0.00030, "output": 0.0025},
    "gemini-2.5-flash-lite": {"input": 0.00010, "output": 0.00040},
    "gemini-flash-latest": {"input": 0.00030, "output": 0.0025},
    "gemini-flash-lite-latest": {"input": 0.00010, "output": 0.00040},
    "gemini-pro-latest": {"input": 0.00125, "output": 0.010},
    # DeepSeek — api-docs.deepseek.com/quick_start/pricing
    "deepseek-v4-pro": {"input": 0.00055, "output": 0.00219},
    "deepseek-v4-flash": {"input": 0.00014, "output": 0.00028},
}


def _estimate_cost(
    model: str, prompt_tokens: int | None, completion_tokens: int | None
) -> float | None:
    prices = _PRICE_TABLE.get(model)
    if not prices or not prompt_tokens or not completion_tokens:
        return None
    return (
        prompt_tokens * prices["input"] + completion_tokens * prices["output"]
    ) / 1000


def process_message(raw_data: str) -> dict:
    """Parse, re-redact, enrich, and return a DB-ready dict."""
    data: dict = json.loads(raw_data)

    # Re-run PII redaction on previews (defense-in-depth)
    original_summary: dict[str, int] = data.get("redactionSummary") or {}
    combined_summary = dict(original_summary)

    if input_preview := data.get("inputPreview"):
        result = redact(input_preview)
        data["inputPreview"] = result.text
        for k, v in result.summary.items():
            combined_summary[k] = max(combined_summary.get(k, 0), v)

    if output_preview := data.get("outputPreview"):
        result = redact(output_preview)
        data["outputPreview"] = result.text
        for k, v in result.summary.items():
            combined_summary[k] = max(combined_summary.get(k, 0), v)

    had_discrepancy = check_discrepancy(original_summary, combined_summary)
    if had_discrepancy:
        logger.warning("PII discrepancy on request %s", data.get("requestId"))
        combined_summary["_discrepancy"] = 1

    # Estimate cost
    cost = _estimate_cost(
        data.get("model", ""),
        data.get("promptTokens"),
        data.get("completionTokens"),
    )

    # Normalise camelCase → snake_case for DB
    return {
        "request_id": data["requestId"],
        "conversation_id": data.get("conversationId"),
        "message_id": data.get("messageId"),
        "provider": data["provider"],
        "model": data["model"],
        "status": data["status"],
        "error_code": data.get("errorCode"),
        "error_message": data.get("errorMessage"),
        "started_at": data["startedAt"],
        "finished_at": data.get("finishedAt"),
        "latency_ms": data.get("latencyMs"),
        "ttft_ms": data.get("ttftMs"),
        "prompt_tokens": data.get("promptTokens"),
        "completion_tokens": data.get("completionTokens"),
        "total_tokens": data.get("totalTokens"),
        "cost_usd": cost,
        "input_preview": data.get("inputPreview"),
        "output_preview": data.get("outputPreview"),
        "redaction_summary": combined_summary or None,
        "sdk_version": data.get("sdkVersion"),
    }


async def handle_message(raw_data: str) -> None:
    """Process one stream message: enrich and persist."""
    try:
        db_row = process_message(raw_data)
        await upsert_inference_log(db_row)
    except Exception:
        logger.exception("Failed to process message")
        raise
