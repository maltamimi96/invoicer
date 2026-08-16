"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "@/components/ui/icons";

export function AcceptQuoteButton({ token, quoteId }: { token: string; quoteId: string }) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = () => {
    setError(null);
    start(async () => {
      try {
        const res = await fetch(`/api/portal/${token}/quote/${quoteId}/accept`, { method: "POST" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          // Was a native alert(): an OS dialog with the page's hostname on it,
          // landing on a customer who is mid-way through accepting a quote from
          // a tradesperson. It reads like something has gone wrong with their
          // browser rather than with the request, and on iOS it can be
          // suppressed entirely — leaving the button looking simply dead.
          setError(err.error || "We couldn't accept the quote. Please try again.");
          return;
        }
        setDone(true);
        refresh();
      } catch {
        // fetch itself failed — almost always the customer's connection.
        setError("Couldn't reach us just then. Check your connection and try again.");
      }
    });
  };

  if (done) {
    return (
      <Button disabled className="bg-emerald-600 hover:bg-emerald-600">
        <Check className="w-4 h-4 mr-2" /> Accepted
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={accept} disabled={pending} size="lg" className="bg-emerald-600 hover:bg-emerald-700">
        {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
        Accept quote
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
