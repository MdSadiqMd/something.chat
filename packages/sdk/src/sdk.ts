import { AnthropicAdapter } from "./adapters/anthropic.ts";
import { DeepSeekAdapter } from "./adapters/deepseek.ts";
import { GoogleAdapter } from "./adapters/google.ts";
import { OpenAIAdapter } from "./adapters/openai.ts";
import { LogEmitter } from "./emitter.ts";
import { mergeSummaries, redactPreview } from "./redact.ts";
import type {
  ChatOptions,
  InferenceLog,
  ProviderAdapter,
  ProviderName,
  SdkConfig,
  TokenDelta,
} from "./types.ts";

const SDK_VERSION = "0.1.0";

export class LLMSdk {
  private readonly adapters: Map<ProviderName, ProviderAdapter>;
  private readonly emitter: LogEmitter;
  private readonly sdkVersion: string;

  constructor(config: SdkConfig) {
    this.sdkVersion = config.sdkVersion ?? SDK_VERSION;
    this.emitter = new LogEmitter(config.ingestionUrl);
    this.adapters = new Map();

    if (config.providers.openai) {
      this.adapters.set("openai", new OpenAIAdapter(config.providers.openai));
    }
    if (config.providers.anthropic) {
      this.adapters.set("anthropic", new AnthropicAdapter(config.providers.anthropic));
    }
    if (config.providers.google) {
      this.adapters.set("google", new GoogleAdapter(config.providers.google));
    }
    if (config.providers.deepseek) {
      this.adapters.set("deepseek", new DeepSeekAdapter(config.providers.deepseek));
    }
  }

  async *chat(options: ChatOptions): AsyncIterable<TokenDelta> {
    const adapter = this.adapters.get(options.provider);
    if (!adapter) {
      throw new Error(`Provider "${options.provider}" is not configured.`);
    }

    const requestId = crypto.randomUUID();
    const signal = options.signal ?? new AbortController().signal;

    const inputPreview = redactPreview(
      options.messages.map((m) => m.content).join("\n")
    );

    const req = {
      requestId,
      conversationId: options.conversationId,
      provider: options.provider,
      model: options.model,
      messages: options.messages,
      maxTokens: options.maxTokens,
    };

    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    let ttftMs: number | undefined;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let totalTokens: number | undefined;
    let status: InferenceLog["status"] = "ok";
    let errorCode: string | undefined;
    let errorMessage: string | undefined;
    const outputChunks: string[] = [];
    let redactionSummary: Record<string, number> = inputPreview.summary;

    try {
      for await (const event of adapter.stream(req, signal)) {
        if (event.kind === "delta") {
          if (ttftMs === undefined) ttftMs = Date.now() - startMs;
          outputChunks.push(event.text);
          yield { requestId, text: event.text };
        } else if (event.kind === "usage") {
          // Last usage event wins (some providers emit intermediate ones)
          if (event.promptTokens > 0) promptTokens = event.promptTokens;
          completionTokens = event.completionTokens;
          totalTokens = event.totalTokens;
        }
      }
    } catch (err) {
      if (signal.aborted) {
        status = "cancelled";
        errorCode = "CANCELLED";
      } else {
        status = "error";
        errorCode = err instanceof Error ? err.constructor.name : "UNKNOWN";
        errorMessage = err instanceof Error ? err.message : String(err);
      }
    } finally {
      const outputText = outputChunks.join("");
      const outputPreview = redactPreview(outputText);
      redactionSummary = mergeSummaries(redactionSummary, outputPreview.summary);

      const log: InferenceLog = {
        requestId,
        conversationId: options.conversationId,
        messageId: options.messageId,
        provider: options.provider,
        model: options.model,
        status,
        errorCode,
        errorMessage,
        startedAt,
        finishedAt: new Date().toISOString(),
        latencyMs: Date.now() - startMs,
        ttftMs,
        promptTokens,
        completionTokens,
        totalTokens,
        inputPreview: inputPreview.text,
        outputPreview: outputPreview.text,
        redactionSummary,
        sdkVersion: this.sdkVersion,
      };

      this.emitter.emit(log);
    }
  }
}
