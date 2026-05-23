"""LLM provider adapters — Python mirror of the TypeScript SDK's adapters.

Each adapter exposes an async generator `stream(model, messages)` that yields
StreamEvent objects with either text deltas or final usage stats.
"""

import os
import re
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass
class StreamEvent:
    kind: str  # "delta" or "usage"
    text: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


_PII_PATTERNS = [
    ("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+", re.IGNORECASE), "[EMAIL]"),
    ("phone", re.compile(r"\b(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), "[PHONE]"),
    ("ssn", re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
    ("credit_card", re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"), "[CREDIT_CARD]"),
    ("ip_address", re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[IP]"),
]


def redact_preview(text: str, max_length: int = 300) -> tuple[str, dict[str, int]]:
    """Returns (redacted_truncated_text, summary_counts)."""
    summary: dict[str, int] = {}
    result = text
    for name, pattern, replacement in _PII_PATTERNS:
        matches = pattern.findall(result)
        if matches:
            summary[name] = len(matches)
            result = pattern.sub(replacement, result)
    truncated = result if len(result) <= max_length else result[:max_length] + "…"
    return truncated, summary


class OpenAIAdapter:
    name = "openai"

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def stream(self, model: str, messages: list[dict]) -> AsyncIterator[StreamEvent]:
        stream = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            stream_options={"include_usage": True},
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield StreamEvent(kind="delta", text=chunk.choices[0].delta.content)
            if chunk.usage:
                yield StreamEvent(
                    kind="usage",
                    prompt_tokens=chunk.usage.prompt_tokens or 0,
                    completion_tokens=chunk.usage.completion_tokens or 0,
                    total_tokens=chunk.usage.total_tokens or 0,
                )


class AnthropicAdapter:
    name = "anthropic"

    def __init__(self, api_key: str) -> None:
        from anthropic import AsyncAnthropic
        self.client = AsyncAnthropic(api_key=api_key)

    async def stream(self, model: str, messages: list[dict]) -> AsyncIterator[StreamEvent]:
        system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
        user_msgs = [
            {"role": m["role"], "content": m["content"]}
            for m in messages
            if m["role"] != "system"
        ]

        kwargs = {"model": model, "max_tokens": 4096, "messages": user_msgs}
        if system_msg:
            kwargs["system"] = system_msg

        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield StreamEvent(kind="delta", text=text)
            final = await stream.get_final_message()
            yield StreamEvent(
                kind="usage",
                prompt_tokens=final.usage.input_tokens,
                completion_tokens=final.usage.output_tokens,
                total_tokens=final.usage.input_tokens + final.usage.output_tokens,
            )


class GoogleAdapter:
    name = "google"

    def __init__(self, api_key: str) -> None:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self.genai = genai

    async def stream(self, model: str, messages: list[dict]) -> AsyncIterator[StreamEvent]:
        history = []
        for m in messages[:-1]:
            if m["role"] == "system":
                continue
            role = "model" if m["role"] == "assistant" else "user"
            history.append({"role": role, "parts": [m["content"]]})

        last_text = messages[-1]["content"] if messages else ""
        gmodel = self.genai.GenerativeModel(model)
        chat = gmodel.start_chat(history=history)

        response = await chat.send_message_async(last_text, stream=True)
        async for chunk in response:
            if chunk.text:
                yield StreamEvent(kind="delta", text=chunk.text)

        # Final usage stats
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            yield StreamEvent(
                kind="usage",
                prompt_tokens=response.usage_metadata.prompt_token_count or 0,
                completion_tokens=response.usage_metadata.candidates_token_count or 0,
                total_tokens=response.usage_metadata.total_token_count or 0,
            )


class DeepSeekAdapter(OpenAIAdapter):
    name = "deepseek"

    def __init__(self, api_key: str) -> None:
        super().__init__(api_key=api_key, base_url="https://api.deepseek.com")


_ADAPTERS = {
    "openai": OpenAIAdapter,
    "anthropic": AnthropicAdapter,
    "google": GoogleAdapter,
    "deepseek": DeepSeekAdapter,
}


def build_provider(name: str):
    env_keys = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "google": "GOOGLE_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
    }
    if name not in _ADAPTERS:
        raise ValueError(f"Unknown provider: {name}")

    api_key = os.environ.get(env_keys[name])
    if not api_key:
        raise ValueError(
            f"Provider '{name}' is not configured — {env_keys[name]} is not set"
        )

    return _ADAPTERS[name](api_key=api_key)


def get_configured_providers() -> list[str]:
    """Return list of provider names that have an API key set."""
    env_keys = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "google": "GOOGLE_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
    }
    return [name for name, env in env_keys.items() if os.environ.get(env)]
