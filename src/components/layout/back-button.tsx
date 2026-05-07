"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

interface Props {
  /** Where to send the user if there's no browser history to go back to
   *  (e.g. they bookmarked the detail page). */
  fallbackHref: string;
  className?: string;
}

/** Smart back button — uses router.back() so the user returns to whatever
 *  page they came from (a quote, the customer they were viewing, search
 *  results, etc), instead of always being dumped back to the list view.
 *  Falls back to fallbackHref when there's nothing in history. */
export function BackButton({ fallbackHref, className }: Props) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // history.length is 1 on a fresh tab — going "back" would leave the app.
    // Anything > 1 means we have somewhere meaningful to go.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  // Render as a real <Link> for right-click "open in new tab" + keyboard users,
  // but intercept the click for the smart-back behaviour.
  return (
    <Link href={fallbackHref} onClick={handleClick} aria-label="Back" className={className}>
      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
        <ArrowLeft className="w-4 h-4" />
      </Button>
    </Link>
  );
}
