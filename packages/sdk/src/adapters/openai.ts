import OpenAI from "openai";
import type { AdapterEvent, NormalizedRequest, ProviderAdapter } from "../types.ts";

export class OpenAIAdapter implements ProviderAdapter {
  readonly name = "openai" as const;
  private readonly client: OpenAI;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
  }

  async *stream(req: NormalizedRequest, signal: AbortSignal): AsyncIterable<AdapterEvent> {
    const stream = await this.client.chat.completions.create(
      {
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal }
    );

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) yield { kind: "delta", text };

      if (chunk.usage) {
        yield {
          kind: "usage",
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }
    }
  }
}
