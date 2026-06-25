import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        /* ── Structural variants ──────────────────────── */
        default:     "border-transparent bg-primary text-primary-foreground",
        secondary:   "border-transparent bg-secondary text-secondary-foreground",
        outline:     "border border-border-subtle text-foreground",
        muted:       "border-transparent bg-muted text-muted-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",

        /* ── Status variants (use badge-* utility classes from globals) ── */
        "status-todo": [
          "border",
          "badge-todo"
        ],
        "status-in-progress": [
          "border",
          "badge-in-progress"
        ],
        "status-in-review": [
          "border",
          "badge-in-review"
        ],
        "status-done": [
          "border",
          "badge-done"
        ],
        "status-blocked": [
          "border",
          "badge-blocked"
        ],
        "status-cancelled": [
          "border",
          "badge-cancelled"
        ],

        /* ── Priority variants ────────────────────────── */
        "priority-urgent": "border-transparent bg-destructive/10 text-status-blocked border border-status-blocked/30",
        "priority-high":   "border-transparent bg-accent-data/10  text-accent-data  border border-accent-data/30",
        "priority-medium": "border-transparent bg-brand/10        text-brand        border border-brand/30",
        "priority-low":    "border-transparent bg-muted           text-muted-foreground border border-border-subtle",

        /* ── Data / analytics ─────────────────────────── */
        data: "border border-accent-data/30 bg-accent-data/10 text-accent-data font-mono text-[11px]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
