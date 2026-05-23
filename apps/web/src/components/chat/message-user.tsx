/**
 * Copied from OpenChat/src/components/chat/message-user.tsx
 * Stripped: EditInput, MorphingDialog, file parts — kept exact layout & action classes.
 */

import { CheckIcon, CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { memo, useState, useSyncExternalStore } from "react";
import {
	MessageAction,
	MessageActions,
	Message as MessageContainer,
	MessageContent,
} from "#/components/prompt-kit/message";
import { cn } from "#/lib/utils";

function useIsTouchDevice(): boolean {
	return useSyncExternalStore(
		() => () => {},
		() =>
			typeof window !== "undefined" &&
			("ontouchstart" in window || navigator.maxTouchPoints > 0),
		() => false,
	);
}

export type MessageUserProps = {
	id: string;
	content: string;
	status?: "streaming" | "ready" | "submitted" | "error";
	onDelete: (id: string) => void;
};

function MessageUserInner({ id, content, status, onDelete }: MessageUserProps) {
	const [copied, setCopied] = useState(false);
	const isTouch = useIsTouchDevice();

	const copy = () => {
		navigator.clipboard.writeText(content);
		setCopied(true);
		setTimeout(() => setCopied(false), 500);
	};

	return (
		<MessageContainer
			className={cn(
				"group flex w-full max-w-3xl flex-col items-end gap-2 px-6 pb-2",
			)}
			id={id}
		>
			<MessageContent
				className="relative max-w-[70%] whitespace-pre-line rounded-3xl bg-accent px-5 py-2.5"
				markdown={false}
			>
				{content}
			</MessageContent>

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
							<CheckIcon className="size-4" />
						) : (
							<CopyIcon className="size-4" />
						)}
					</button>
				</MessageAction>
				<MessageAction delayDuration={0} side="bottom" tooltip="Delete">
					<button
						type="button"
						aria-label="Delete"
						className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
						disabled={status === "streaming"}
						onClick={() => onDelete(id)}
					>
						<TrashIcon className="size-4" />
					</button>
				</MessageAction>
			</MessageActions>
		</MessageContainer>
	);
}

export const MessageUser = memo(MessageUserInner);
