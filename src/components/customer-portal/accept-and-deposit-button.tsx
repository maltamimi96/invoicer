"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2 } from "@/components/ui/icons";

export function AcceptAndDepositButton({
  token,
  quoteId,
  label,
}: {
  token: string;
  quoteId: string;
  /** e.g. "Accept & pay 50% deposit (£385)" */
  label: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const go = () => {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/portal/${token}/quote/${quoteId}/accept-with-deposit`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.redirect) {
        setError(data?.error || "Couldn't start payment");
        return;
      }
      // The redirect target 303s onward to Stripe's hosted checkout.
      window.location.href = data.redirect;
    });
  };

  return (
    <div className="space-y-2">
      <Button onClick={go} disabled={pending} size="lg" className="bg-primary hover:opacity-90">
        {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
        {label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
