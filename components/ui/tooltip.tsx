"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

// Accessible tooltip for icon-only controls (a big win for decluttering — labels
// can move into tooltips so the cockpit stays quiet). Wrap the app (or a subtree)
// once in <TooltipProvider>.
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

// Concise wrapper so any control gets an informative tooltip with one tag:
//   <Tip content="What this does">{<button/>}</Tip>
// Requires a <TooltipProvider> ancestor (wrap the surface once).
export function Tip({
  content,
  side = "top",
  children,
}: {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}) {
  if (!content) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-xs rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-white/90 shadow-md",
        "data-[state=delayed-open]:animate-[fadeIn_120ms_ease-out]",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
