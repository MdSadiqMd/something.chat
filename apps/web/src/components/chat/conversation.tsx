/**
 * Copied from OpenChat/src/components/chat/conversation.tsx
 * Uses use-stick-to-bottom (same as original), adapted for our Message type.
 */

import React, { useEffect, useRef, useState } from "react";
import { ScrollButton } from "#/components/prompt-kit/scroll-button";
import {
	ChatContainerContent,
	ChatContainerRoot,
	ChatContainerScrollAnchor,
} from "#/components/prompt-kit/chat-container";
import { Loader } from "#/components/prompt-kit/loader";
import type { Message as MessageType } from "#/lib/types";
import { Message } from "./message";

type ConversationProps = {
	messages: MessageType[];
	streamText: string;
	streaming: boolean;
	model?: string;
	onDelete: (id: string) => void;
	onBranch: (id: string) => void;
	onReload: (id: string) => void;
};

const Conversation = React.memo(function ConversationComponent({
	messages,
	streamText,
	streaming,
	model,
	onDelete,
	onBranch,
	onReload,
}: ConversationProps) {
	const [resizeMode, setResizeMode] = useState<"instant" | "smooth">("instant");
	const didSetSmooth = useRef(false);

	useEffect(() => {
		if (messages.length === 0 || didSetSmooth.current) return;
		didSetSmooth.current = true;
		let raf2 = 0;
		const raf1 = requestAnimationFrame(() => {
			raf2 = requestAnimationFrame(() => setResizeMode("smooth"));
		});
		return () => {
			cancelAnimationFrame(raf1);
			if (raf2) cancelAnimationFrame(raf2);
		};
	}, [messages.length]);

	return (
		<div className="relative flex h-full min-h-0 w-full flex-col items-center">
			<ChatContainerRoot
				className="relative flex-1 min-h-0 w-full flex-col items-center overflow-x-hidden"
				resize={resizeMode}
				style={{ scrollbarGutter: "stable both-edges" }}
			>
				<ChatContainerContent className="relative flex w-full flex-col items-center pt-20 pb-4">
					{messages.map((msg, index) => {
						const isLast = index === messages.length - 1;

						return (
							<Message
								key={msg.id}
								msg={msg}
								model={model}
								isLast={isLast && !streaming}
								status={isLast && !streaming ? "ready" : undefined}
								onDelete={onDelete}
								onBranch={onBranch}
								onReload={onReload}
							/>
						);
					})}

					{/* Streaming bubble */}
					{streaming && (
						<div className="group flex w-full max-w-3xl flex-1 items-start gap-4 px-6 pb-2">
							{streamText ? (
								<p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
									{streamText}
									<span className="inline-block w-0.5 h-[1em] bg-foreground/70 ml-0.5 animate-pulse align-text-bottom" />
								</p>
							) : (
								<div className="flex items-center gap-2 text-muted-foreground">
									<Loader size="md" variant="dots" />
								</div>
							)}
						</div>
					)}
				</ChatContainerContent>

				<ChatContainerScrollAnchor />

				<div className="absolute bottom-0 w-full max-w-3xl">
					<ScrollButton className="absolute top-[-50px] right-[30px]" />
				</div>
			</ChatContainerRoot>
		</div>
	);
});

export { Conversation };
