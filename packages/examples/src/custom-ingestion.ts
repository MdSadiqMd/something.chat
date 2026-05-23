/**
 * custom-ingestion.ts
 *
 * Shows how to point the SDK at a custom ingestion endpoint (e.g. your own
 * logging service) and how the InferenceLog payload looks.
 *
 * This example mocks the ingestion endpoint locally so you can run it
 * without a running API server.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... pnpm --filter @something-chat/examples custom-ingestion
 */

import { createServer } from "node:http";
import { LLMSdk, type InferenceLog } from "@something-chat/sdk";

// ── Spin up a minimal mock ingestion server ───────────────────────────────────

function startMockServer(port: number): Promise<{ close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        const log = JSON.parse(body) as InferenceLog;
        console.log("\n── Received inference log ──────────────────────────────");
        console.log(`  requestId:        ${log.requestId}`);
        console.log(`  provider/model:   ${log.provider}/${log.model}`);
        console.log(`  status:           ${log.status}`);
        console.log(`  latency:          ${log.latencyMs ?? "—"} ms`);
        console.log(`  ttft:             ${log.ttftMs ?? "—"} ms`);
        console.log(`  tokens:           ${log.totalTokens ?? "—"} total`);
        console.log(`  inputPreview:     ${log.inputPreview ?? "—"}`);
        console.log(`  outputPreview:    ${log.outputPreview ?? "—"}`);
        if (log.redactionSummary && Object.keys(log.redactionSummary).length > 0) {
          console.log(`  redaction:        ${JSON.stringify(log.redactionSummary)}`);
        }
        console.log("────────────────────────────────────────────────────────");
        res.writeHead(202);
        res.end(JSON.stringify({ status: "accepted" }));
      });
    });

    server.listen(port, () => {
      console.log(`Mock ingestion server listening on http://localhost:${port}/v1/logs\n`);
      resolve({ close: () => server.close() });
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const PORT = 19999;
  const { close } = await startMockServer(PORT);

  const sdk = new LLMSdk({
    providers: {
      openai: { apiKey: process.env["OPENAI_API_KEY"] ?? "" },
    },
    ingestionUrl: `http://localhost:${PORT}/v1/logs`,
  });

  // Include PII in the prompt to see redaction in action
  const prompt =
    "My email is alice@example.com and my phone is 555-867-5309. " +
    "Say hello to me in one sentence.";

  console.log("Sending chat request with PII in prompt…");

  for await (const delta of sdk.chat({
    provider: "openai",
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    conversationId: crypto.randomUUID(),
  })) {
    process.stdout.write(delta.text);
  }

  // Wait for the fire-and-forget emitter to POST the log
  await new Promise((r) => setTimeout(r, 500));

  close();
  console.log("\nExample complete.");
}

main().catch(console.error);
