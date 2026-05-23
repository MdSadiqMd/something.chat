/**
 * multi-provider.ts
 *
 * Sends the same prompt to every configured provider in parallel and
 * prints each reply as it streams. Demonstrates provider-switching with
 * a single SDK instance.
 *
 * Run (set whichever keys you have):
 *   OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-... GOOGLE_API_KEY=AIza... \
 *   pnpm --filter @something-chat/examples multi-provider
 */

import { LLMSdk, type ProviderName } from "@something-chat/sdk";

const PROVIDER_MODELS: Record<ProviderName, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  google: "gemini-1.5-flash",
  deepseek: "deepseek-chat",
};

const sdk = new LLMSdk({
  providers: {
    ...(process.env["OPENAI_API_KEY"]
      ? { openai: { apiKey: process.env["OPENAI_API_KEY"] } }
      : {}),
    ...(process.env["ANTHROPIC_API_KEY"]
      ? { anthropic: { apiKey: process.env["ANTHROPIC_API_KEY"] } }
      : {}),
    ...(process.env["GOOGLE_API_KEY"]
      ? { google: { apiKey: process.env["GOOGLE_API_KEY"] } }
      : {}),
    ...(process.env["DEEPSEEK_API_KEY"]
      ? { deepseek: { apiKey: process.env["DEEPSEEK_API_KEY"] } }
      : {}),
  },
  ingestionUrl: process.env["INGEST_API_URL"] ?? "http://localhost:8000/v1/logs",
});

const PROMPT = "Describe yourself in exactly one sentence.";

async function streamProvider(provider: ProviderName): Promise<void> {
  const model = PROVIDER_MODELS[provider];
  const parts: string[] = [];
  const start = Date.now();

  try {
    for await (const delta of sdk.chat({
      provider,
      model,
      messages: [{ role: "user", content: PROMPT }],
      conversationId: crypto.randomUUID(),
    })) {
      parts.push(delta.text);
    }

    const elapsed = Date.now() - start;
    console.log(`[${provider}/${model}] (${elapsed}ms)\n  ${parts.join("")}\n`);
  } catch (err) {
    console.error(`[${provider}] Error:`, (err as Error).message);
  }
}

async function main() {
  const configured = (Object.keys(PROVIDER_MODELS) as ProviderName[]).filter(
    (p) => {
      const key = `${p.toUpperCase()}_API_KEY`;
      return Boolean(process.env[key]);
    }
  );

  if (configured.length === 0) {
    console.error("No provider API keys set. See file header for instructions.");
    process.exit(1);
  }

  console.log(`Running prompt against: ${configured.join(", ")}\n`);
  console.log(`Prompt: "${PROMPT}"\n`);

  await Promise.all(configured.map(streamProvider));
}

main().catch(console.error);
