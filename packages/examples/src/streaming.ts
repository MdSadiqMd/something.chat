/**
 * streaming.ts
 *
 * Shows real-time token streaming with TTFT (time-to-first-token) measurement.
 *
 * Run:
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @something-chat/examples streaming
 */

import { LLMSdk } from "@something-chat/sdk";

const sdk = new LLMSdk({
  providers: {
    anthropic: { apiKey: process.env["ANTHROPIC_API_KEY"] ?? "" },
  },
  ingestionUrl: process.env["INGEST_API_URL"] ?? "http://localhost:8000/v1/logs",
});

async function main() {
  const conversationId = crypto.randomUUID();
  const startMs = Date.now();
  let ttft: number | undefined;
  let tokenCount = 0;

  console.log("Streaming from claude-haiku-4-5-20251001…\n");

  for await (const delta of sdk.chat({
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    messages: [
      {
        role: "user",
        content: "Write a haiku about streaming data.",
      },
    ],
    conversationId,
  })) {
    if (ttft === undefined) {
      ttft = Date.now() - startMs;
    }
    process.stdout.write(delta.text);
    tokenCount++;
  }

  const totalMs = Date.now() - startMs;

  console.log("\n\n─────────────────────────────");
  console.log(`TTFT:        ${ttft ?? "—"} ms`);
  console.log(`Total time:  ${totalMs} ms`);
  console.log(`Token chunks: ${tokenCount}`);
}

main().catch(console.error);
