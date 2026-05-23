import { describe, expect, it, vi } from "vitest";
import { LogEmitter } from "../emitter.ts";
import type { InferenceLog } from "../types.ts";

const makeLog = (): InferenceLog => ({
  requestId: "req-123",
  conversationId: "conv-456",
  provider: "openai",
  model: "gpt-4o-mini",
  status: "ok",
  startedAt: new Date().toISOString(),
  sdkVersion: "0.1.0",
});

describe("LogEmitter", () => {
  it("POSTs log to ingestion URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 202 })
    );

    const emitter = new LogEmitter("http://localhost:8000/v1/logs");
    emitter.emit(makeLog());

    // Give microtask queue a tick to start the async chain
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/v1/logs",
      expect.objectContaining({ method: "POST" })
    );

    fetchSpy.mockRestore();
  });

  it("does not throw when fetch fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network error")
    );

    const emitter = new LogEmitter("http://localhost:8000/v1/logs");
    // Should not throw
    expect(() => emitter.emit(makeLog())).not.toThrow();

    await new Promise((r) => setTimeout(r, 50));
    fetchSpy.mockRestore();
  });
});
