// Server-only — never import this in client code.
// In Cloudflare Workers (nodejs_compat), process.env reads from .dev.vars locally
// and from wrangler secrets in production.

function optionalEnv(key: string): string | undefined {
	return process.env[key] || undefined;
}

export const serverEnv = {
	apiBaseUrl: process.env["API_BASE_URL"] ?? "http://localhost:8000",
	ingestApiUrl:
		process.env["INGEST_API_URL"] ?? "http://localhost:8000/v1/logs",

	openaiApiKey: optionalEnv("OPENAI_API_KEY"),
	anthropicApiKey: optionalEnv("ANTHROPIC_API_KEY"),
	googleApiKey: optionalEnv("GOOGLE_API_KEY"),
	deepseekApiKey: optionalEnv("DEEPSEEK_API_KEY"),
} as const;

export type Provider = "openai" | "anthropic" | "google" | "deepseek";

export function getConfiguredProviders(): Provider[] {
	const providers: Provider[] = [];
	if (serverEnv.openaiApiKey) providers.push("openai");
	if (serverEnv.anthropicApiKey) providers.push("anthropic");
	if (serverEnv.googleApiKey) providers.push("google");
	if (serverEnv.deepseekApiKey) providers.push("deepseek");
	return providers;
}
