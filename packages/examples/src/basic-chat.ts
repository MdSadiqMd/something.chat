/**
 * basic-chat.ts
 *
 * Simplest possible usage: one message, one provider, collect the full reply.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... pnpm --filter @something-chat/examples basic
 */

import { LLMSdk } from "@something-chat/sdk";

const sdk = new LLMSdk({
  providers: {
    openai: { apiKey: process.env["OPENAI_API_KEY"] ?? "" },
  },
  ingestionUrl: process.env["INGEST_API_URL"] ?? "http://localhost:8000/v1/logs",
});

async function main() {
  const tokens: string[] = [];

  for await (const delta of sdk.chat({
    provider: "openai",
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "What is 2 + 2? Answer in one sentence." }],
    conversationId: crypto.randomUUID(),
  })) {
    process.stdout.write(delta.text);
    tokens.push(delta.text);
  }

  console.log("\n\nFull reply:", tokens.join(""));
}

main().catch(console.error);
