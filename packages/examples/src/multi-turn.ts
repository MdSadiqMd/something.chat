/**
 * multi-turn.ts
 *
 * Builds a multi-turn conversation by accumulating the assistant's replies
 * and feeding them back as history. Each turn is a separate sdk.chat() call
 * sharing the same conversationId so all logs are correlated.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... pnpm --filter @something-chat/examples multi-turn
 */

import { LLMSdk, type Message } from "@something-chat/sdk";

const sdk = new LLMSdk({
  providers: {
    openai: { apiKey: process.env["OPENAI_API_KEY"] ?? "" },
  },
  ingestionUrl: process.env["INGEST_API_URL"] ?? "http://localhost:8000/v1/logs",
});

const TURNS: string[] = [
  "My name is Ada. Remember it.",
  "What is my name?",
  "What programming language am I named after?",
];

async function main() {
  const conversationId = crypto.randomUUID();
  const history: Message[] = [];

  console.log(`Conversation ID: ${conversationId}\n`);

  for (const userText of TURNS) {
    history.push({ role: "user", content: userText });

    console.log(`User: ${userText}`);
    process.stdout.write("Assistant: ");

    const parts: string[] = [];

    for await (const delta of sdk.chat({
      provider: "openai",
      model: "gpt-4o-mini",
      messages: history,
      conversationId,
    })) {
      process.stdout.write(delta.text);
      parts.push(delta.text);
    }

    const reply = parts.join("");
    history.push({ role: "assistant", content: reply });
    console.log("\n");
  }
}

main().catch(console.error);
