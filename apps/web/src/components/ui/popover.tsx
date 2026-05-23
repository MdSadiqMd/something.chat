/**
 * Zero-dependency popover — pure React state + CSS positioning.
 * Replaces @radix-ui/react-popover which pulled in tslib via CJS bundles.
 */

import React, {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "#/lib/utils";

interface PopoverCtx {
	open: boolean;
	setOpen: (v: boolean) => void;
}

const Ctx = createContext<PopoverCtx | null>(null);

interface PopoverProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: React.ReactNode;
}

function Popover({ open: controlled, onOpenChange, children }: PopoverProps) {
	const [internal, setInternal] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const open = controlled ?? internal;

	const setOpen = (v: boolean) => {
		setInternal(v);
		onOpenChange?.(v);
	};

	useEffect(() => {
		if (!open) return;
		const close = (e: MouseEvent) => {
			if (root.current && !root.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [open]);

	return (
		<Ctx.Provider value={{ open, setOpen }}>
			<div ref={root} className="relative inline-block">
				{children}
			</div>
		</Ctx.Provider>
	);
}

interface PopoverTriggerProps {
	asChild?: boolean;
	children: React.ReactNode;
}

function PopoverTrigger({ asChild, children }: PopoverTriggerProps) {
	const ctx = useContext(Ctx)!;
	const toggle = (e: React.MouseEvent) => {
		e.stopPropagation();
		ctx.setOpen(!ctx.open);
	};
	if (asChild) {
		return React.cloneElement(
			React.Children.only(children) as React.ReactElement<{
				onClick: (e: React.MouseEvent) => void;
			}>,
			{
				onClick: toggle,
			},
		);
	}
	return (
		<button type="button" onClick={toggle}>
			{children}
		</button>
	);
}

interface PopoverContentProps {
	className?: string;
	align?: "start" | "center" | "end";
	side?: "top" | "bottom";
	sideOffset?: number;
	children: React.ReactNode;
}

function PopoverContent({
	className,
	align = "center",
	side = "bottom",
	sideOffset = 4,
	children,
}: PopoverContentProps) {
	const ctx = useContext(Ctx)!;
	if (!ctx.open) return null;

	const vert =
		side === "top"
			? { bottom: `calc(100% + ${sideOffset}px)` }
			: { top: `calc(100% + ${sideOffset}px)` };

	const horiz =
		align === "start"
			? { left: 0 }
			: align === "end"
				? { right: 0 }
				: { left: "50%", transform: "translateX(-50%)" };

	return (
		<div
			className={cn(
				"absolute z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
				"animate-in fade-in-0 zoom-in-95",
				className,
			)}
			style={{ ...vert, ...horiz, minWidth: "8rem" }}
			onClick={(e) => e.stopPropagation()}
		>
			{children}
		</div>
	);
}

function PopoverAnchor({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
