import { describe, expect, it, vi } from "vitest";
import { LLMSdk } from "../sdk.ts";
import type { AdapterEvent, NormalizedRequest, ProviderAdapter, SdkConfig } from "../types.ts";

// Minimal mock adapter that yields a few deltas then usage
function makeMockAdapter(): ProviderAdapter {
  return {
    name: "openai" as const,
    async *stream(_req: NormalizedRequest, signal: AbortSignal): AsyncIterable<AdapterEvent> {
      const words = ["Hello", " ", "world", "!"];
      for (const word of words) {
        if (signal.aborted) return;
        yield { kind: "delta", text: word };
      }
      yield { kind: "usage", promptTokens: 10, completionTokens: 4, totalTokens: 14 };
    },
  };
}

function makeConfig(): SdkConfig {
  return {
    providers: { openai: { apiKey: "test-key" } },
    ingestionUrl: "http://localhost:8000/v1/logs",
  };
}

describe("LLMSdk", () => {
  it("throws when provider is not configured", async () => {
    const sdk = new LLMSdk(makeConfig());
    const gen = sdk.chat({
      provider: "anthropic",
      model: "claude-3-haiku",
      messages: [{ role: "user", content: "Hi" }],
      conversationId: "conv-1",
    });

    await expect(gen.next()).rejects.toThrow('Provider "anthropic" is not configured');
  });

  it("yields text deltas from adapter", async () => {
    // Bypass real adapter by injecting via the internal adapters map
    const sdk = new LLMSdk(makeConfig());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sdk as any).adapters.set("openai", makeMockAdapter());

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));

    const tokens: string[] = [];
    for await (const delta of sdk.chat({
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
      conversationId: "conv-1",
    })) {
      tokens.push(delta.text);
    }

    expect(tokens.join("")).toBe("Hello world!");
    vi.restoreAllMocks();
  });

  it("emits inference log after streaming", async () => {
    const sdk = new LLMSdk(makeConfig());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sdk as any).adapters.set("openai", makeMockAdapter());

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    const gen = sdk.chat({
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "test" }],
      conversationId: "conv-2",
    });

    // drain
    for await (const _ of gen) { /* consume */ }

    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [, options] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
    expect(body["status"]).toBe("ok");
    expect(body["totalTokens"]).toBe(14);

    fetchSpy.mockRestore();
  });

  it("logs cancelled status when aborted", async () => {
    const sdk = new LLMSdk(makeConfig());
    const controller = new AbortController();

    const adapter: ProviderAdapter = {
      name: "openai" as const,
      async *stream(_req: NormalizedRequest, signal: AbortSignal): AsyncIterable<AdapterEvent> {
        yield { kind: "delta", text: "Hello" };
        controller.abort();
        if (signal.aborted) {
          const err = new Error("aborted");
          err.name = "AbortError";
          throw err;
        }
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sdk as any).adapters.set("openai", adapter);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    for await (const _ of sdk.chat({
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "test" }],
      conversationId: "conv-3",
      signal: controller.signal,
    })) { /* consume */ }

    await new Promise((r) => setTimeout(r, 20));
    const [, opts] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
    expect(body["status"]).toBe("cancelled");

    fetchSpy.mockRestore();
  });
});
