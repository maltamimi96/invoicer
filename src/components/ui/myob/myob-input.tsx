import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * MYOB-style control geometry: taller (44px), calm border, and a *subtle*
 * focus ring — the animated teal underline from `MyobField` is the star, so
 * these controls deliberately keep their own focus treatment quiet.
 */
export const myobControlClass =
  "flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground transition-shadow " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:border-primary/60 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const MyobInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input type={type} ref={ref} className={cn(myobControlClass, className)} {...props} />
  ),
);
MyobInput.displayName = "MyobInput";

const MyobTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-24 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm text-foreground " +
          "placeholder:text-muted-foreground transition-shadow " +
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:border-primary/60 " +
          "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
MyobTextarea.displayName = "MyobTextarea";

export { MyobInput, MyobTextarea };
