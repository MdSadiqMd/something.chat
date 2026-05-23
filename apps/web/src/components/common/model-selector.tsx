/**
 * ModelSelector — visual copy of OpenChat's ModelSelectorV2.
 * Uses static PROVIDER_MODELS data instead of Convex.
 */

import {
	CaretDownIcon,
	CheckIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { cn } from "#/lib/utils";
import { PROVIDER_MODELS } from "#/lib/types";
import type { Provider } from "#/lib/types";

// All providers in display order
const PROVIDERS: Provider[] = ["openai", "anthropic", "google", "deepseek"];

// Simple text abbreviations used as provider "icons" (matches OpenChat sidebar icon size)
const PROVIDER_ABBREV: Record<Provider, string> = {
	openai: "GPT",
	anthropic: "Cld",
	google: "Gem",
	deepseek: "DS",
};

const PROVIDER_LABEL: Record<Provider, string> = {
	openai: "OpenAI",
	anthropic: "Anthropic",
	google: "Google",
	deepseek: "DeepSeek",
};

type Props = {
	selectedModel: string;
	selectedProvider: Provider;
	onSelect: (provider: Provider, model: string) => void;
	className?: string;
};

export function ModelSelector({
	selectedModel,
	selectedProvider,
	onSelect,
	className,
}: Props) {
	const [open, setOpen] = useState(false);
	const [activeProvider, setActiveProvider] =
		useState<Provider>(selectedProvider);
	const [search, setSearch] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);

	const models = PROVIDER_MODELS[activeProvider] ?? [];
	const filtered = search.trim()
		? models.filter((m) => m.toLowerCase().includes(search.toLowerCase()))
		: models;

	const handleSelect = (provider: Provider, model: string) => {
		onSelect(provider, model);
		setOpen(false);
		setSearch("");
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				{/* Trigger button — same rounded-full shape as OpenChat */}
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						"h-8 gap-1 rounded-full border border-input px-3 text-xs text-muted-foreground hover:text-foreground",
						className,
					)}
					type="button"
				>
					<span className="max-w-[140px] truncate">{selectedModel}</span>
					<CaretDownIcon className="size-3 shrink-0 opacity-60" />
				</Button>
			</PopoverTrigger>

			{/* Popover content — exact OpenChat w-[460px] two-column layout */}
			<PopoverContent
				align="start"
				side="top"
				sideOffset={8}
				className={cn(
					"flex w-[460px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl",
					"border border-border bg-background/95 p-0 shadow-2xl backdrop-blur-md",
					"data-[state=open]:animate-in data-[state=closed]:animate-out",
					"data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
					"data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-95",
				)}
			>
				{/* Search bar */}
				<div className="flex items-center gap-2 border-b border-border px-3 py-2">
					<MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
					<input
						ref={searchRef}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search models…"
						className="w-full bg-transparent py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
						autoFocus
					/>
				</div>

				{/* Two-column: provider sidebar + model list */}
				<div className="flex" style={{ height: 320 }}>
					{/* Provider sidebar — w-14 like OpenChat */}
					<div className="no-scrollbar flex h-full w-14 shrink-0 flex-col items-center overflow-y-auto overflow-x-hidden rounded-tr-xl border-r border-border bg-sidebar-accent/30 py-2 gap-1">
						{PROVIDERS.map((p) => {
							const isActive = p === activeProvider;
							return (
								<button
									key={p}
									type="button"
									onClick={() => {
										setActiveProvider(p);
										setSearch("");
									}}
									className={cn(
										"relative flex h-10 w-10 flex-col items-center justify-center rounded-lg text-[9px] font-bold transition-colors",
										isActive
											? "bg-sidebar-accent text-sidebar-accent-foreground"
											: "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
									)}
									title={PROVIDER_LABEL[p]}
								>
									{isActive && (
										<span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
									)}
									<span className="leading-none">{PROVIDER_ABBREV[p]}</span>
								</button>
							);
						})}
					</div>

					{/* Model list */}
					<div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto p-2 gap-0.5">
						{filtered.length === 0 ? (
							<div className="flex h-full items-center justify-center text-xs text-muted-foreground">
								No models found
							</div>
						) : (
							filtered.map((m) => {
								const isSelected =
									m === selectedModel && activeProvider === selectedProvider;
								return (
									<button
										key={m}
										type="button"
										onClick={() => handleSelect(activeProvider, m)}
										className={cn(
											"group flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors",
											"hover:bg-sidebar-accent/60",
											isSelected &&
												"bg-sidebar-accent text-sidebar-accent-foreground",
										)}
									>
										<span className="flex-1 truncate font-medium">{m}</span>
										{isSelected && (
											<CheckIcon className="size-4 shrink-0 text-primary" />
										)}
									</button>
								);
							})
						)}
					</div>
				</div>

				{/* Footer */}
				<div className="border-t border-border px-3 py-2">
					<p className="text-xs text-muted-foreground">
						{PROVIDER_LABEL[activeProvider]} ·{" "}
						{(PROVIDER_MODELS[activeProvider] ?? []).length} models
					</p>
				</div>
			</PopoverContent>
		</Popover>
	);
}
