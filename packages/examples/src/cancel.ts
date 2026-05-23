/**
 * cancel.ts
 *
 * Demonstrates AbortController-based cancellation mid-stream.
 * The stream is cancelled after the first 3 token chunks and the SDK
 * still logs a "cancelled" inference record to the ingestion endpoint.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... pnpm --filter @something-chat/examples cancel
 */

import { LLMSdk } from "@something-chat/sdk";

const sdk = new LLMSdk({
  providers: {
    openai: { apiKey: process.env["OPENAI_API_KEY"] ?? "" },
  },
  ingestionUrl: process.env["INGEST_API_URL"] ?? "http://localhost:8000/v1/logs",
});

async function main() {
  const controller = new AbortController();
  let received = 0;

  console.log("Streaming (will cancel after 3 chunks)…\n");

  try {
    for await (const delta of sdk.chat({
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "Count from 1 to 100, one number per line.",
        },
      ],
      conversationId: crypto.randomUUID(),
      signal: controller.signal,
    })) {
      process.stdout.write(delta.text);
      received++;

      if (received >= 3) {
        console.log("\n\n[Aborting after 3 chunks…]");
        controller.abort();
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.log("[Stream cancelled successfully]");
    } else {
      throw err;
    }
  }

  // The SDK fires a log with status="cancelled" to the ingestion endpoint.
  // Give the fire-and-forget emitter a moment to finish.
  await new Promise((r) => setTimeout(r, 300));
  console.log("\nDone. A 'cancelled' inference log was sent to the ingestion API.");
}

main().catch(console.error);
