import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowUp,
	Check,
	PencilSimple,
	SidebarSimple,
	Stop,
	TrashSimple,
	X,
} from "@phosphor-icons/react";
import { m, LazyMotion, domAnimation } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	PromptInput,
	PromptInputAction,
	PromptInputActions,
	PromptInputTextarea,
} from "#/components/prompt-kit/prompt-input";
import { Conversation } from "#/components/chat/conversation";
import { ModelSelector } from "#/components/common/model-selector";
import { cn } from "#/lib/utils";
import {
	addMessage,
	cancelConversation,
	createConversation,
	deleteMessage,
	listConversations,
	listMessages,
	updateConversation,
} from "../lib/api-client.ts";
import type {
	Conversation as ConversationType,
	Message as MessageType,
	Provider,
} from "../lib/types.ts";

export const Route = createFileRoute("/")({
	validateSearch: (
		search: Record<string, unknown>,
	): { conversationId?: string } => {
		const id = search["conversationId"] as string | undefined;
		return id ? { conversationId: id } : {};
	},
	loader: async ({ location }) => {
		const conversationId = (location.search as { conversationId?: string })
			.conversationId;
		try {
			const [conversations, initialMessages] = await Promise.all([
				listConversations(),
				conversationId
					? listMessages({ data: conversationId })
					: Promise.resolve([]),
			]);
			return {
				conversations,
				initialMessages,
				initialConvId: conversationId ?? null,
			};
		} catch {
			return { conversations: [], initialMessages: [], initialConvId: null };
		}
	},
	component: ChatPage,
});

function ChatPage() {
	const {
		conversations: initialConvs,
		initialMessages,
		initialConvId,
	} = Route.useLoaderData();

	const [conversations, setConversations] =
		useState<ConversationType[]>(initialConvs);
	const [activeId, setActiveId] = useState<string | null>(initialConvId);
	const [messages, setMessages] = useState<MessageType[]>(initialMessages);
	const [input, setInput] = useState("");
	const [streaming, setStreaming] = useState(false);
	const [streamText, setStreamText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);

	const [provider, setProvider] = useState<Provider>("google");
	const [model, setModel] = useState<string>("gemini-2.5-flash");

	const abortRef = useRef<AbortController | null>(null);

	const loadConversation = useCallback(async (id: string) => {
		setActiveId(id);
		setStreamText("");
		setError(null);
		try {
			const msgs = await listMessages({ data: id });
			setMessages(msgs);
		} catch (e) {
			setError(`Failed to load: ${e instanceof Error ? e.message : String(e)}`);
		}
	}, []);

	const handleNewChat = async () => {
		setError(null);
		try {
			const conv = await createConversation({
				data: {
					title: "New Conversation",
					model_default: model,
					provider_default: provider,
				},
			});
			setConversations((prev) => [conv, ...prev]);
			setActiveId(conv.id);
			setMessages([]);
			setStreamText("");
		} catch (e) {
			setError(
				`Failed to create: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	};

	const handleRenameConversation = async (id: string, title: string) => {
		await updateConversation({ data: { id, title } }).catch(() => null);
		setConversations((prev) =>
			prev.map((c) => (c.id === id ? { ...c, title } : c)),
		);
	};

	const handleDeleteConversation = async (id: string) => {
		setError(null);
		try {
			await cancelConversation({ data: id });
			setConversations((prev) => prev.filter((c) => c.id !== id));
			if (activeId === id) {
				setActiveId(null);
				setMessages([]);
			}
		} catch (e) {
			setError(
				`Failed to delete: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	};

	// Branch: create new conversation pre-seeded with history up to (and including) the branched message
	const handleBranch = async (messageId: string) => {
		if (!activeId || streaming) return;
		setError(null);
		const idx = messages.findIndex((m) => m.id === messageId);
		const history = idx >= 0 ? messages.slice(0, idx + 1) : messages;
		try {
			const conv = await createConversation({
				data: {
					title: `Branch: ${history[0]?.content.slice(0, 40) ?? "Chat"}`,
					model_default: model,
					provider_default: provider,
				},
			});
			// Persist all messages in the branch
			for (const m of history) {
				await addMessage({
					data: { conversationId: conv.id, role: m.role, content: m.content },
				});
			}
			setConversations((prev) => [conv, ...prev]);
			setActiveId(conv.id);
			setMessages(history.map((m) => ({ ...m, conversation_id: conv.id })));
			setStreamText("");
		} catch (e) {
			setError(`Branch failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	};

	// Regenerate: delete the assistant message, re-stream using history before it
	const handleRegenerate = async (messageId: string) => {
		if (!activeId || streaming) return;
		setError(null);
		const idx = messages.findIndex((m) => m.id === messageId);
		if (idx < 0) return;
		const historyBeforeReply = messages.slice(0, idx);

		// Delete the old assistant message from DB + UI
		void deleteMessage({ data: { conversationId: activeId, messageId } });
		setMessages(historyBeforeReply);

		// Stream new reply from history (no new user message added to DB)
		const controller = new AbortController();
		abortRef.current = controller;
		setStreaming(true);
		setStreamText("");
		try {
			const apiBase =
				(import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
				"http://localhost:8000";
			const response = await fetch(`${apiBase}/v1/chat/stream`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					conversationId: activeId,
					provider,
					model,
					messages: historyBeforeReply.map((m) => ({
						role: m.role,
						content: m.content,
					})),
				}),
				signal: controller.signal,
			});
			if (!response.ok || !response.body) throw new Error("Stream failed");
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let accumulated = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				for (const line of decoder
					.decode(value, { stream: true })
					.split("\n")) {
					if (!line.startsWith("data: ")) continue;
					try {
						const ev = JSON.parse(line.slice(6)) as {
							type: string;
							text?: string;
							messageId?: string;
							fullText?: string;
							error?: string;
						};
						if (ev.type === "delta" && ev.text) {
							accumulated += ev.text;
							setStreamText(accumulated);
						} else if (ev.type === "done") {
							setMessages((prev) => [
								...prev,
								{
									id: ev.messageId ?? crypto.randomUUID(),
									conversation_id: activeId,
									role: "assistant",
									content: ev.fullText ?? accumulated,
									inference_log_id: null,
									created_at: new Date().toISOString(),
								},
							]);
							setStreamText("");
						} else if (ev.type === "error")
							setError(`LLM error: ${ev.error ?? "Unknown"}`);
					} catch {
						/* skip */
					}
				}
			}
		} catch (err) {
			if ((err as Error).name !== "AbortError")
				setError(`Error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setStreaming(false);
			setStreamText("");
			abortRef.current = null;
		}
	};

	const handleSend = async (overrideContent?: string) => {
		const userContent = overrideContent ?? input.trim();
		if (!userContent || !activeId || streaming) return;
		setError(null);
		if (!overrideContent) setInput("");

		let userMsg: MessageType;
		try {
			userMsg = await addMessage({
				data: { conversationId: activeId, role: "user", content: userContent },
			});
		} catch (e) {
			setError(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
			setInput(userContent);
			return;
		}
		const updatedMessages = [...messages, userMsg];
		setMessages(updatedMessages);

		const activeConvTitle = conversations.find((c) => c.id === activeId)?.title;
		if (activeConvTitle === "New Conversation") {
			const title = userContent.slice(0, 60);
			void updateConversation({ data: { id: activeId, title } }).then(() => {
				setConversations((prev) =>
					prev.map((c) => (c.id === activeId ? { ...c, title } : c)),
				);
			});
		}

		const controller = new AbortController();
		abortRef.current = controller;
		setStreaming(true);
		setStreamText("");

		try {
			const apiBase =
				(import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
				"http://localhost:8000";
			const response = await fetch(`${apiBase}/v1/chat/stream`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					conversationId: activeId,
					provider,
					model,
					messages: updatedMessages.map((m) => ({
						role: m.role,
						content: m.content,
					})),
				}),
				signal: controller.signal,
			});

			if (!response.ok)
				throw new Error(
					`${response.status}: ${await response.text().catch(() => response.statusText)}`,
				);
			if (!response.body) throw new Error("No response body");

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let accumulated = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				for (const line of decoder
					.decode(value, { stream: true })
					.split("\n")) {
					if (!line.startsWith("data: ")) continue;
					try {
						const ev = JSON.parse(line.slice(6)) as {
							type: string;
							text?: string;
							messageId?: string;
							fullText?: string;
							error?: string;
						};
						if (ev.type === "delta" && ev.text) {
							accumulated += ev.text;
							setStreamText(accumulated);
						} else if (ev.type === "done") {
							setMessages((prev) => [
								...prev,
								{
									id: ev.messageId ?? crypto.randomUUID(),
									conversation_id: activeId,
									role: "assistant",
									content: ev.fullText ?? accumulated,
									inference_log_id: null,
									created_at: new Date().toISOString(),
								},
							]);
							setStreamText("");
						} else if (ev.type === "error") {
							setError(`LLM error: ${ev.error ?? "Unknown"}`);
						}
					} catch {
						/* skip malformed */
					}
				}
			}
		} catch (err) {
			if ((err as Error).name !== "AbortError") {
				setError(`Error: ${err instanceof Error ? err.message : String(err)}`);
			}
		} finally {
			setStreaming(false);
			setStreamText("");
			abortRef.current = null;
		}
	};

	// activeConv reserved for future title display

	return (
		<LazyMotion features={domAnimation}>
			<div className="flex h-dvh overflow-hidden bg-background">
				{/* ── Sidebar ─────────────────────────────────────────── */}
				<div className="z-51 hidden md:block">
					{/* Fixed toggle + floating buttons when collapsed */}
					<div className="fixed top-4 left-4 z-[60] flex flex-row items-center">
						<button
							type="button"
							aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
							className="group flex items-center justify-center rounded-full p-2 outline-none transition-all duration-300 hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
							onClick={() => setIsSidebarOpen((v) => !v)}
						>
							<SidebarSimple
								className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
								weight="bold"
							/>
						</button>
					</div>

					{/* Sidebar panel */}
					<m.aside
						animate={{ width: isSidebarOpen ? 256 : 0 }}
						initial={{ width: isSidebarOpen ? 256 : 0 }}
						transition={{ type: "spring", bounce: 0, duration: 0.3 }}
						className="flex h-dvh flex-col overflow-hidden border-r border-sidebar-border bg-sidebar shadow-lg"
					>
						{/* Header row inside sidebar */}
						<m.div
							animate={{ opacity: isSidebarOpen ? 1 : 0 }}
							initial={{ opacity: isSidebarOpen ? 1 : 0 }}
							transition={{ duration: 0.15 }}
							className="flex h-[60px] shrink-0 items-center justify-end pt-2 pr-2"
						>
							<span className="ml-14 flex-1 font-semibold text-sm text-sidebar-foreground tracking-tight">
								something.chat
							</span>
						</m.div>

						<m.div
							animate={{ opacity: isSidebarOpen ? 1 : 0 }}
							initial={{ opacity: isSidebarOpen ? 1 : 0 }}
							transition={{ duration: 0.15, delay: isSidebarOpen ? 0.1 : 0 }}
							className="flex shrink-0 flex-col gap-3 px-4 pt-2 pb-0"
						>
							<Button
								variant="outline"
								className="h-9 w-full justify-center font-semibold text-sm"
								onClick={() => void handleNewChat()}
							>
								New Chat
							</Button>
						</m.div>

						{/* Error */}
						{error && (
							<m.div
								animate={{ opacity: isSidebarOpen ? 1 : 0 }}
								initial={{ opacity: 0 }}
								className="mx-3 mt-2"
							>
								<button
									type="button"
									className="w-full flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/15"
									onClick={() => setError(null)}
								>
									<span className="shrink-0 mt-0.5">⚠</span>
									<span className="line-clamp-3">{error}</span>
								</button>
							</m.div>
						)}

						{/* Chat list */}
						<m.div
							animate={{ opacity: isSidebarOpen ? 1 : 0 }}
							initial={{ opacity: isSidebarOpen ? 1 : 0 }}
							transition={{ duration: 0.15, delay: isSidebarOpen ? 0.1 : 0 }}
							className="relative flex flex-grow flex-col overflow-hidden"
						>
							<div className="flex-grow overflow-y-auto px-4 pt-4 pb-4">
								{conversations.length === 0 ? (
									<span className="px-1.5 text-muted-foreground text-sm">
										No chat history found.
									</span>
								) : (
									<div className="flex flex-col gap-0.5">
										{conversations.map((conv) => (
											<ChatItem
												key={conv.id}
												conv={conv}
												isActive={conv.id === activeId}
												onSelect={() => void loadConversation(conv.id)}
												onDelete={() => void handleDeleteConversation(conv.id)}
												onRename={(title) =>
													void handleRenameConversation(conv.id, title)
												}
											/>
										))}
									</div>
								)}
							</div>
							{/* Bottom fade */}
							<div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-sidebar to-transparent" />
						</m.div>
					</m.aside>
				</div>

				{/* ── Main ────────────────────────────────────────────── */}
				<div className="flex flex-1 flex-col overflow-hidden min-w-0">
					{/* Header — no model picker here, matches OpenChat header */}
					<header className="h-14 shrink-0 border-b border-border flex items-center bg-background px-4 sm:px-6">
						<div className="flex items-center md:hidden">
							<span className="font-semibold text-sm">something.chat</span>
						</div>
					</header>

					{/* Content */}
					<main className="flex flex-1 flex-col overflow-hidden">
						{!activeId ? (
							<div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
								<div className="text-center">
									<h2 className="text-xl font-semibold text-foreground">
										something.chat
									</h2>
									<p className="mt-1 text-sm text-muted-foreground">
										How can I help you today?
									</p>
								</div>
								<Button
									variant="outline"
									className="h-9 px-5"
									onClick={() => void handleNewChat()}
								>
									Start a new chat
								</Button>
							</div>
						) : (
							<>
								{/* Messages — Conversation uses use-stick-to-bottom, exact OpenChat scroll */}
								<div className="flex-1 min-h-0 overflow-hidden">
									<Conversation
										messages={messages}
										streamText={streamText}
										streaming={streaming}
										model={model}
										onDelete={(id) => {
											if (!activeId) return;
											// Remove from UI immediately, then persist to DB
											setMessages((prev) => prev.filter((m) => m.id !== id));
											void deleteMessage({
												data: { conversationId: activeId, messageId: id },
											});
										}}
										onBranch={(id) => void handleBranch(id)}
										onReload={(id) => void handleRegenerate(id)}
									/>
								</div>

								{/* Input — exact OpenChat chat-input.tsx layout */}
								<div className="relative order-2 px-2 pb-3 sm:pb-4 md:order-1">
									<div className="mx-auto max-w-3xl w-full">
										<PromptInput
											className="relative z-10 p-0 pb-2 backdrop-blur-xl"
											maxHeight={200}
											value={input}
											onValueChange={setInput}
											isLoading={streaming}
											onSubmit={() => void handleSend()}
										>
											<PromptInputTextarea
												className="mt-2 ml-2 text-foreground leading-[1.3]"
												disabled={streaming}
												placeholder="How can I help you today?"
											/>
											{/* Actions row — left: ModelSelector, right: send/stop */}
											<PromptInputActions className="mt-5 w-full justify-between px-2 sm:px-2">
												<div className="flex origin-left scale-90 transform gap-1 sm:scale-100 sm:gap-2">
													{/* ModelSelector — same position as SelectModel in OpenChat */}
													<ModelSelector
														selectedModel={model}
														selectedProvider={provider}
														onSelect={(p, m) => {
															setProvider(p);
															setModel(m);
														}}
													/>
												</div>
												<PromptInputAction
													tooltip={streaming ? "Stop" : "Send"}
												>
													<Button
														aria-label={streaming ? "Stop" : "Send message"}
														className="origin-right scale-90 transform rounded-full transition-all duration-300 ease-out sm:scale-100"
														disabled={!input.trim() && !streaming}
														onClick={() =>
															streaming
																? abortRef.current?.abort()
																: void handleSend()
														}
														size="sm"
														type="button"
													>
														{streaming ? (
															<Stop className="size-4" />
														) : (
															<ArrowUp className="size-4" />
														)}
													</Button>
												</PromptInputAction>
											</PromptInputActions>
										</PromptInput>
									</div>
								</div>
							</>
						)}
					</main>
				</div>
			</div>
		</LazyMotion>
	);
}

// ── ChatItem — copied from OpenChat's chat-item.tsx, adapted for our types ───

function ChatItem({
	conv,
	isActive,
	onSelect,
	onDelete,
	onRename,
}: {
	conv: ConversationType;
	isActive: boolean;
	onSelect: () => void;
	onDelete: () => void;
	onRename: (title: string) => void;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const [editedTitle, setEditedTitle] = useState(conv.title);
	const [isDeleting, setIsDeleting] = useState(false);
	const [showActions, setShowActions] = useState(false);

	if (isEditing) {
		return (
			<div className="group/menu-item relative flex h-9 items-center rounded-lg bg-accent px-2 py-0.5">
				<div className="flex w-full items-center justify-between">
					<Input
						className="h-8 flex-1 rounded-none border-0 bg-transparent px-1 text-sm shadow-none outline-none focus:ring-0 focus-visible:ring-0"
						value={editedTitle}
						onChange={(e) => setEditedTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								onRename(editedTitle);
								setIsEditing(false);
							}
							if (e.key === "Escape") setIsEditing(false);
						}}
						autoFocus
					/>
					<div className="ml-2 flex gap-0.5">
						<Button
							className="size-8 rounded-md p-1.5 text-muted-foreground hover:text-primary"
							onClick={() => {
								onRename(editedTitle);
								setIsEditing(false);
							}}
							size="icon"
							variant="ghost"
							type="button"
						>
							<Check className="size-4" />
						</Button>
						<Button
							className="size-8 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
							onClick={() => setIsEditing(false)}
							size="icon"
							variant="ghost"
							type="button"
						>
							<X className="size-4" />
						</Button>
					</div>
				</div>
			</div>
		);
	}

	if (isDeleting) {
		return (
			<div className="group/menu-item relative flex h-9 w-full items-center overflow-hidden rounded-lg bg-accent px-2 py-1 text-accent-foreground text-sm">
				<div className="flex w-full items-center justify-between">
					<span className="font-medium text-destructive text-sm">
						Delete chat?
					</span>
					<div className="flex items-center gap-0.5">
						<Button
							className="size-8 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
							onClick={onDelete}
							size="icon"
							variant="ghost"
							type="button"
						>
							<Check className="size-4" />
						</Button>
						<Button
							className="size-8 rounded-md p-1.5 text-muted-foreground hover:text-primary"
							onClick={() => setIsDeleting(false)}
							size="icon"
							variant="ghost"
							type="button"
						>
							<X className="size-4" />
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"group/link relative flex h-9 w-full cursor-pointer items-center overflow-hidden rounded-lg px-2 py-1 text-sm outline-none transition-colors",
				"hover:bg-accent hover:text-accent-foreground",
				isActive ? "bg-accent text-accent-foreground" : "",
			)}
			onClick={onSelect}
			onMouseEnter={() => setShowActions(true)}
			onMouseLeave={() => setShowActions(false)}
		>
			<div className="relative flex w-full items-center">
				<div className="relative w-full">
					<span className="pointer-events-none block h-full w-full cursor-pointer overflow-hidden truncate rounded bg-transparent px-1 py-1 text-sm outline-none">
						{conv.title}
					</span>
				</div>
			</div>

			{(showActions || isActive) && (
				<div className="-right-0.25 pointer-events-auto absolute top-0 bottom-0 z-10 flex translate-x-full items-center justify-end text-muted-foreground transition-transform duration-200 group-hover/link:translate-x-0 group-hover/link:bg-accent">
					<div className="pointer-events-none absolute top-0 right-[100%] bottom-0 h-12 w-8 bg-gradient-to-l from-accent to-transparent opacity-0 transition-opacity duration-200 group-hover/link:opacity-100" />
					<Button
						className="rounded-md p-1.5 text-muted-foreground hover:bg-blue-500/20 hover:text-blue-600 dark:hover:text-blue-400"
						onClick={(e) => {
							e.stopPropagation();
							setIsEditing(true);
						}}
						size="icon"
						tabIndex={-1}
						variant="ghost"
						type="button"
					>
						<PencilSimple className="size-4" />
					</Button>
					<Button
						className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/50 hover:text-destructive-foreground"
						onClick={(e) => {
							e.stopPropagation();
							setIsDeleting(true);
						}}
						size="icon"
						tabIndex={-1}
						variant="ghost"
						type="button"
					>
						<TrashSimple className="size-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
