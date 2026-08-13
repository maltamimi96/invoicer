"use client";

/**
 * The dashboard's error boundary.
 *
 * There wasn't one. Seventy-six pages sat under this segment, and anything a
 * server component threw — a malformed id reaching Postgres, a dropped
 * connection, a null nobody guarded — fell through to Next's default error
 * screen: an unstyled page, no way back, no way to retry, and nothing the
 * person could tell you afterwards except "it broke".
 *
 * It deliberately keeps the shell around it. You are still signed in, the
 * sidebar still works, and only the content area failed — so the page should
 * say that rather than implying the whole app is down.
 *
 * The digest is shown because it is the only string that ties what the user saw
 * to a line in the server logs. Small, muted, monospaced, copyable.
 */

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/kirei";
import { AlertCircle } from "@/components/ui/icons";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The boundary swallows it otherwise; keep it in the browser console for
    // anyone debugging over a screen-share.
    console.error("[dashboard]", error);
  }, [error]);

  return (
    <div className="py-6">
      <EmptyState
        icon={<AlertCircle className="h-6 w-6 text-white" />}
        gradient="rose"
        title="Something went wrong on this page"
        hint="The rest of the app is fine. Try again — if it keeps happening, the reference below will tell us exactly where it broke."
      />

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>

      {error.digest && (
        <p className="mt-6 text-center font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
