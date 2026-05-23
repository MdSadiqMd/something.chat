export type ProviderName = "openai" | "anthropic" | "google" | "deepseek";
export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface TokenDelta {
  requestId: string;
  text: string;
}

// Internal adapter event — richer than the public TokenDelta
export type AdapterEvent =
  | { kind: "delta"; text: string }
  | { kind: "usage"; promptTokens: number; completionTokens: number; totalTokens: number };

export interface NormalizedRequest {
  requestId: string;
  conversationId: string;
  provider: ProviderName;
  model: string;
  messages: Message[];
  maxTokens?: number;
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  stream(req: NormalizedRequest, signal: AbortSignal): AsyncIterable<AdapterEvent>;
}

export interface InferenceLog {
  requestId: string;
  conversationId: string;
  messageId?: string;
  provider: ProviderName;
  model: string;
  status: "ok" | "error" | "cancelled";
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
  latencyMs?: number;
  ttftMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputPreview?: string;
  outputPreview?: string;
  redactionSummary?: Record<string, number>;
  sdkVersion: string;
}

export interface ChatOptions {
  provider: ProviderName;
  model: string;
  messages: Message[];
  conversationId: string;
  messageId?: string;
  signal?: AbortSignal;
  maxTokens?: number;
}

export interface SdkConfig {
  providers: Partial<Record<ProviderName, { apiKey: string; baseUrl?: string }>>;
  ingestionUrl: string;
  sdkVersion?: string;
}
