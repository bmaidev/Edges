"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// The one button. Themed to the room's CSS vars (accent/surface/border) so it
// re-themes per room. Focus-visible ring, disabled state, and a subtle press
// scale are baked in so every call site is consistent and accessible.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background,color,border,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] select-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary action — the room's accent. One per view (e.g. Advance).
        primary:
          "bg-accent text-bg font-semibold shadow-sm hover:brightness-110",
        // Standard action on a surface.
        secondary:
          "border border-border bg-surface text-white/90 hover:border-white/25 hover:bg-white/[0.04]",
        // Low-emphasis / tertiary — text-forward, no chrome until hover.
        ghost: "text-white/70 hover:bg-white/[0.06] hover:text-white",
        // Destructive / end-session tier.
        danger:
          "border border-[#ff6b6b]/40 bg-[#ff6b6b]/10 text-[#ff9a9a] hover:bg-[#ff6b6b]/15",
        // A quiet outline for toggles/segmented use.
        outline:
          "border border-border bg-transparent text-white/80 hover:bg-white/[0.05]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
