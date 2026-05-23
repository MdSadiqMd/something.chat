import Anthropic from "@anthropic-ai/sdk";
import type { AdapterEvent, NormalizedRequest, ProviderAdapter } from "../types.ts";

export class AnthropicAdapter implements ProviderAdapter {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(config: { apiKey: string }) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async *stream(req: NormalizedRequest, signal: AbortSignal): AsyncIterable<AdapterEvent> {
    // Anthropic separates system messages
    const systemMsg = req.messages.find((m) => m.role === "system");
    const userMessages = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const stream = this.client.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        system: systemMsg?.content,
        messages: userMessages,
      },
      { signal }
    );

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { kind: "delta", text: event.delta.text };
      }
      if (event.type === "message_delta" && event.usage) {
        yield {
          kind: "usage",
          promptTokens: 0,
          completionTokens: event.usage.output_tokens,
          totalTokens: event.usage.output_tokens,
        };
      }
    }

    // Capture final usage from the completed message
    const finalMsg = await stream.finalMessage();
    yield {
      kind: "usage",
      promptTokens: finalMsg.usage.input_tokens,
      completionTokens: finalMsg.usage.output_tokens,
      totalTokens: finalMsg.usage.input_tokens + finalMsg.usage.output_tokens,
    };
  }
}
