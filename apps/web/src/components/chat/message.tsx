import React from "react";
import { MessageAssistant } from "./message-assistant";
import { MessageUser } from "./message-user";
import type { Message as MessageType } from "#/lib/types";

export type MessageProps = {
	msg: MessageType;
	model?: string;
	isLast?: boolean;
	status?: "streaming" | "ready" | "submitted" | "error";
	onDelete: (id: string) => void;
	onBranch: (id: string) => void;
	onReload: (id: string) => void;
};

function MessageComponent({
	msg,
	model,
	isLast,
	status,
	onDelete,
	onBranch,
	onReload,
}: MessageProps) {
	if (msg.role === "user") {
		return (
			<MessageUser
				id={msg.id}
				content={msg.content}
				status={status}
				onDelete={onDelete}
			/>
		);
	}
	return (
		<MessageAssistant
			id={msg.id}
			content={msg.content}
			model={model}
			status={isLast ? status : "ready"}
			isLast={isLast}
			onReload={() => onReload(msg.id)}
			onBranch={() => onBranch(msg.id)}
		/>
	);
}

export const Message = React.memo(MessageComponent);
Message.displayName = "Message";
