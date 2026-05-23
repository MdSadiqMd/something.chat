/**
 * Copied from OpenChat/src/components/chat/message-assistant.tsx
 * Stripped: ChainOfThought, Reasoning, ConnectorToolCall, WebSearch, file parts
 * Kept: exact layout, copy/branch/regenerate action buttons, Loader, model label.
 */

import { ArrowClockwise, Check, Copy, GitBranch } from "@phosphor-icons/react";
import { memo, useState, useSyncExternalStore } from "react";
import { Loader } from "#/components/prompt-kit/loader";
import {
	Message,
	MessageAction,
	MessageActions,
	MessageContent,
} from "#/components/prompt-kit/message";
import { cn } from "#/lib/utils";

const subscribeToTouchCapability = () => () => {};
const getIsTouchDevice = () =>
	typeof window !== "undefined" &&
	("ontouchstart" in window || navigator.maxTouchPoints > 0);

type MessageAssistantProps = {
	id: string;
	content: string;
	model?: string;
	status?: "streaming" | "ready" | "submitted" | "error";
	isLast?: boolean;
	hasScrollAnchor?: boolean;
	onReload?: () => void;
	onBranch?: () => void;
	readOnly?: boolean;
};

function MessageAssistantInner({
	id,
	content,
	model,
	status,
	isLast: _isLast,
	hasScrollAnchor,
	onReload,
	onBranch,
	readOnly = false,
}: MessageAssistantProps) {
	const [copied, setCopied] = useState(false);
	const isTouch = useSyncExternalStore(
		subscribeToTouchCapability,
		getIsTouchDevice,
		() => false,
	);

	const copy = () => {
		navigator.clipboard.writeText(content);
		setCopied(true);
		setTimeout(() => setCopied(false), 500);
	};

	return (
		<Message
			className={cn(
				"group flex w-full max-w-3xl flex-1 items-start gap-4 px-6 pb-2",
				hasScrollAnchor ? "min-h-scroll-anchor" : "",
			)}
			id={id}
		>
			<div className={cn("flex w-full flex-col gap-2")}>
				{status === "streaming" && !content ? (
					<div className="flex items-center gap-2 text-muted-foreground">
						<Loader size="md" variant="dots" />
					</div>
				) : (
					<MessageContent
						className="relative min-w-full bg-transparent p-0"
						markdown={false}
					>
						{content}
					</MessageContent>
				)}

				<MessageActions
					className={cn(
						"flex gap-0 transition-opacity",
						isTouch
							? "opacity-100"
							: "opacity-100 md:opacity-0 md:group-hover:opacity-100",
					)}
				>
					<MessageAction
						delayDuration={0}
						side="bottom"
						tooltip={copied ? "Copied!" : "Copy text"}
					>
						<button
							type="button"
							aria-label="Copy text"
							className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
							disabled={status === "streaming"}
							onClick={copy}
						>
							{copied ? (
								<Check className="size-4" />
							) : (
								<Copy className="size-4" />
							)}
						</button>
					</MessageAction>

					{!readOnly && (
						<MessageAction
							delayDuration={0}
							side="bottom"
							tooltip="Create a new chat starting from here"
						>
							<button
								type="button"
								aria-label="Branch chat"
								className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
								disabled={status === "streaming"}
								onClick={onBranch}
							>
								<GitBranch className="size-4 rotate-180" />
							</button>
						</MessageAction>
					)}

					{!readOnly && (
						<MessageAction delayDuration={0} side="bottom" tooltip="Regenerate">
							<button
								type="button"
								aria-label="Regenerate"
								className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
								disabled={status === "streaming"}
								onClick={onReload}
							>
								<ArrowClockwise className="size-4" />
							</button>
						</MessageAction>
					)}

					{model ? (
						<span className="ml-2 inline-block text-muted-foreground text-xs">
							{model}
						</span>
					) : null}
				</MessageActions>
			</div>
		</Message>
	);
}

export const MessageAssistant = memo(MessageAssistantInner);
