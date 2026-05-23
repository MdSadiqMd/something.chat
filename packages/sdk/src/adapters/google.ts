import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AdapterEvent, NormalizedRequest, ProviderAdapter } from "../types.ts";

export class GoogleAdapter implements ProviderAdapter {
  readonly name = "google" as const;
  private readonly genai: GoogleGenerativeAI;

  constructor(config: { apiKey: string }) {
    this.genai = new GoogleGenerativeAI(config.apiKey);
  }

  async *stream(req: NormalizedRequest, _signal: AbortSignal): AsyncIterable<AdapterEvent> {
    const model = this.genai.getGenerativeModel({ model: req.model });

    // Convert to Gemini chat history + last user message
    const history = req.messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = req.messages[req.messages.length - 1];
    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage?.content ?? "");

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield { kind: "delta", text };
    }

    const finalResponse = await result.response;
    if (finalResponse.usageMetadata) {
      promptTokens = finalResponse.usageMetadata.promptTokenCount ?? 0;
      completionTokens = finalResponse.usageMetadata.candidatesTokenCount ?? 0;
    }

    yield {
      kind: "usage",
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }
}
