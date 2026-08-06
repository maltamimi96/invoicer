"use client";

/**
 * "We're confirming your payment" — the gap between paying and the webhook.
 *
 * The card provider redirects the browser back the moment the payment is
 * authorised, but the webhook that records it is a separate server-to-server
 * call that usually lands a beat later. In between, the invoice row still says
 * unpaid.
 *
 * Rendering the normal unpaid view there is worse than ugly: it shows a Pay
 * button to someone who has just paid, and some of them will pay twice.
 *
 * So we hold this state briefly and re-check. If it's still not through by the
 * end, we say so plainly rather than silently reverting to "unpaid" — the
 * payment is almost certainly fine and the customer should not pay again.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "@/components/ui/icons";

/** ~18s total. Long enough for a slow webhook, short enough not to strand. */
const CHECKS = [1500, 2000, 2500, 3000, 4000, 5000];

export function PaymentConfirming({ businessPhone, businessEmail }: {
  businessPhone?: string | null;
  businessEmail?: string | null;
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const gaveUp = attempt >= CHECKS.length;

  useEffect(() => {
    if (gaveUp) return;
    const t = setTimeout(() => {
      // A refresh re-runs the server component; if the webhook has landed, the
      // page renders as paid and this component is gone.
      router.refresh();
      setAttempt((n) => n + 1);
    }, CHECKS[attempt]);
    return () => clearTimeout(t);
  }, [attempt, gaveUp, router]);

  if (gaveUp) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
        <p className="text-sm font-semibold">Your payment went through</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We haven&rsquo;t had the confirmation from the payment provider yet, so this page still shows a
          balance. That usually settles within a few minutes.{" "}
          <strong>Please don&rsquo;t pay again.</strong>
        </p>
        {(businessPhone || businessEmail) && (
          <p className="mt-2 text-sm text-muted-foreground">
            If it hasn&rsquo;t updated shortly, contact us
            {businessPhone ? <> on <span className="font-medium text-foreground">{businessPhone}</span></> : null}
            {businessPhone && businessEmail ? " or" : null}
            {businessEmail ? <> at <span className="font-medium text-foreground">{businessEmail}</span></> : null}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Confirming your payment&hellip;
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
        Your card has been charged. We&rsquo;re just waiting for the receipt from the payment provider &mdash;
        this page will update on its own. No need to pay again.
      </p>
    </div>
  );
}
