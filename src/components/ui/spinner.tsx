import { Loader2 } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * One spinner to rule them all. Three sizes; defaults to inheriting `currentColor`
 * so it matches whatever button / pill / row you drop it into.
 */
export function Spinner({
  size = "sm",
  className,
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const px =
    size === "xs" ? "w-3 h-3" :
    size === "sm" ? "w-3.5 h-3.5" :
    size === "md" ? "w-4 h-4" :
                    "w-5 h-5";
  return <Loader2 className={cn(px, "animate-spin", className)} aria-hidden />;
}

/**
 * Centered "loading…" row used inside cards while a fetch resolves —
 * matches the .ch-empty padding so the panel doesn't reflow when real
 * data arrives.
 */
export function LoadingRow({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
      <Spinner size="sm" className="text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/**
 * Pill-style "fetching" indicator for tight spaces (next to a label, inside
 * a row, etc.). Same look as the inline hint we use on AddressSelect.
 */
export function FetchingPill({ label = "Loading…" }: { label?: string }) {
  return (
    <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Spinner size="xs" />
      {label}
    </span>
  );
}
