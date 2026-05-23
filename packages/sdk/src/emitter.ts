import type { InferenceLog } from "./types.ts";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;

export class LogEmitter {
  private readonly ingestionUrl: string;

  constructor(ingestionUrl: string) {
    this.ingestionUrl = ingestionUrl;
  }

  /** Fire-and-forget — never throws, never blocks the chat path. */
  emit(log: InferenceLog): void {
    void this.send(log, MAX_RETRIES);
  }

  private async send(log: InferenceLog, retriesLeft: number): Promise<void> {
    try {
      const res = await fetch(this.ingestionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(log),
      });
      if (!res.ok && retriesLeft > 0) {
        await sleep(RETRY_BASE_MS * (MAX_RETRIES - retriesLeft + 1));
        return this.send(log, retriesLeft - 1);
      }
    } catch {
      if (retriesLeft > 0) {
        await sleep(RETRY_BASE_MS * (MAX_RETRIES - retriesLeft + 1));
        return this.send(log, retriesLeft - 1);
      }
      // All retries exhausted — swallow so chat path is unaffected
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
