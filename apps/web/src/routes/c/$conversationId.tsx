import { createFileRoute, redirect } from "@tanstack/react-router";

// Deep-link to a specific conversation — the index route handles the chat UI.
// We redirect to `/` and pass the conversationId as a search param so the
// index can pre-select and load it.
export const Route = createFileRoute("/c/$conversationId")({
	loader: ({ params }) => {
		throw redirect({
			to: "/",
			search: { conversationId: params.conversationId },
		});
	},
});
