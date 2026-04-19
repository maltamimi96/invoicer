"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";

export function AcceptQuoteButton({ token, quoteId }: { token: string; quoteId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  const accept = () => {
    start(async () => {
      const res = await fetch(`/api/portal/${token}/quote/${quoteId}/accept`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to accept");
        return;
      }
      setDone(true);
      router.refresh();
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
    <Button onClick={accept} disabled={pending} size="lg" className="bg-emerald-600 hover:bg-emerald-700">
      {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
      Accept quote
    </Button>
  );
}
