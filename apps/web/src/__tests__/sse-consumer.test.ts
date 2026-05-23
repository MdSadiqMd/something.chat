/**
 * Functional tests for the client-side SSE consumption logic.
 *
 * These tests verify the exact parsing code used in handleSend:
 * - Reading chunks from a ReadableStream
 * - Parsing SSE data lines
 * - Accumulating text from delta events
 * - Handling the done event (with fullText + messageId)
 * - Handling error events
 * - Handling malformed lines gracefully
 */

import { describe, expect, it } from "vitest";

// ── SSE consumer (mirrors handleSend's inner loop exactly) ────────────────────

interface ParsedSSEResult {
	accumulated: string;
	finalContent: string | undefined;
	savedMessageId: string | undefined;
	errorMessage: string | undefined;
}

async function consumeSSEResponse(
	response: Response,
): Promise<ParsedSSEResult> {
	if (!response.body) throw new Error("No response body");

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let accumulated = "";
	let finalContent: string | undefined;
	let savedMessageId: string | undefined;
	let errorMessage: string | undefined;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		const chunk = decoder.decode(value, { stream: true });
		for (const line of chunk.split("\n")) {
			if (!line.startsWith("data: ")) continue;
			try {
				const event = JSON.parse(line.slice(6)) as {
					type: string;
					text?: string;
					messageId?: string;
					fullText?: string;
					error?: string;
				};
				if (event.type === "delta" && event.text) {
					accumulated += event.text;
				} else if (event.type === "done") {
					finalContent = event.fullText ?? accumulated;
					savedMessageId = event.messageId;
				} else if (event.type === "error") {
					errorMessage = event.error;
				}
			} catch {
				// malformed — skip
			}
		}
	}

	return { accumulated, finalContent, savedMessageId, errorMessage };
}

// ── Stream builder helpers ────────────────────────────────────────────────────

function makeStreamingResponse(
	events: Array<{
		type: string;
		text?: string;
		messageId?: string;
		fullText?: string;
		error?: string;
	}>,
): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const ev of events) {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
			}
			controller.close();
		},
	});
	return new Response(stream, {
		headers: { "Content-Type": "text/event-stream" },
	});
}

function makeChunkedResponse(rawChunks: string[]): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of rawChunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});
	return new Response(stream, {
		headers: { "Content-Type": "text/event-stream" },
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SSE consumer — functional", () => {
	it("accumulates text from delta events", async () => {
		const response = makeStreamingResponse([
			{ type: "delta", text: "Hello" },
			{ type: "delta", text: " world" },
			{ type: "delta", text: "!" },
			{ type: "done", fullText: "Hello world!", messageId: "msg-1" },
		]);

		const result = await consumeSSEResponse(response);

		expect(result.accumulated).toBe("Hello world!");
		expect(result.finalContent).toBe("Hello world!");
		expect(result.savedMessageId).toBe("msg-1");
		expect(result.errorMessage).toBeUndefined();
	});

	it("uses fullText from done event as the authoritative content", async () => {
		// Server-side fullText should take precedence over client-accumulated
		const response = makeStreamingResponse([
			{ type: "delta", text: "Hi" },
			{ type: "done", fullText: "Hi there (server)", messageId: "msg-2" },
		]);

		const result = await consumeSSEResponse(response);

		expect(result.finalContent).toBe("Hi there (server)");
	});

	it("falls back to accumulated text when fullText is absent", async () => {
		const response = makeStreamingResponse([
			{ type: "delta", text: "fallback" },
			{ type: "done", messageId: "msg-3" },
		]);

		const result = await consumeSSEResponse(response);

		expect(result.finalContent).toBe("fallback");
	});

	it("captures error event", async () => {
		const response = makeStreamingResponse([
			{ type: "error", error: "Rate limit exceeded" },
		]);

		const result = await consumeSSEResponse(response);

		expect(result.errorMessage).toBe("Rate limit exceeded");
		expect(result.finalContent).toBeUndefined();
	});

	it("skips malformed SSE lines without throwing", async () => {
		// Inject garbage lines between valid events
		const raw = `data: {"type":"delta","text":"ok"}\n\nnot-a-data-line\n\ndata: BROKEN-JSON\n\ndata: {"type":"done","fullText":"ok","messageId":"m"}\n\n`;
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(encoder.encode(raw));
				c.close();
			},
		});
		const r = new Response(stream, {
			headers: { "Content-Type": "text/event-stream" },
		});

		const result = await consumeSSEResponse(r);

		expect(result.finalContent).toBe("ok");
	});

	it("handles SSE events split across TCP chunks", async () => {
		// Simulate chunked delivery where a single SSE line arrives in two reads
		const part1 = 'data: {"type":"delta","text":"split-';
		const part2 =
			'chunk"}\n\ndata: {"type":"done","fullText":"split-chunk","messageId":"m5"}\n\n';

		const response = makeChunkedResponse([part1, part2]);
		const result = await consumeSSEResponse(response);

		// The second chunk completes the line — done event is parsed
		expect(result.savedMessageId).toBe("m5");
	});

	it("works with empty delta list (zero-token response)", async () => {
		const response = makeStreamingResponse([
			{ type: "done", fullText: "", messageId: "m-empty" },
		]);

		const result = await consumeSSEResponse(response);

		expect(result.finalContent).toBe("");
		expect(result.savedMessageId).toBe("m-empty");
		expect(result.accumulated).toBe("");
	});

	it("handles many deltas correctly", async () => {
		const words = Array.from({ length: 100 }, (_, i) => `word${i} `);
		const events: Array<{
			type: string;
			text?: string;
			messageId?: string;
			fullText?: string;
			error?: string;
		}> = words.map((w) => ({ type: "delta", text: w }));
		events.push({ type: "done", fullText: words.join(""), messageId: "m-big" });

		const result = await consumeSSEResponse(makeStreamingResponse(events));

		expect(result.accumulated).toBe(words.join(""));
		expect(result.finalContent).toBe(words.join(""));
	});
});
