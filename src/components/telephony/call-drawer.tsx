"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Phone, UserPlus } from "@/components/ui/icons";
import { getCallContext, setCallNotes, createCustomerFromCall, placeCall } from "@/lib/actions/telephony";
import { formatAuPhone } from "@/lib/telephony/phone";
import type { CallContext } from "@/lib/actions/telephony";

const money = (n: unknown) => `$${(Number(n) || 0).toFixed(2)}`;

/**
 * Everything about one call: who it was, what's already open for them, their
 * recent call history, and a place to write down what was said.
 *
 * This is the "screen pop" surface — the equivalent of what a CTI integration
 * gives you, but pointed at Kirei's own jobs, quotes and invoices rather than
 * a second system's tickets.
 */
export function CallDrawer({ callId, onClose }: { callId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<CallContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    if (!callId) { setCtx(null); return; }
    let cancelled = false;
    setLoading(true);
    getCallContext(callId)
      .then((c) => {
        if (cancelled) return;
        setCtx(c);
        setNotes(c.call.notes ?? "");
        setNewName(c.call.caller_name ?? "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load call"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [callId]);

  const other = ctx?.call
    ? (ctx.call.direction === "inbound" ? ctx.call.from_number : ctx.call.to_number)
    : null;

  return (
    <Sheet open={Boolean(callId)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{ctx?.party?.name ?? ctx?.call.caller_name ?? "Call"}</SheetTitle>
        </SheetHeader>

        {loading && <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>}

        {ctx && (
          <div className="mt-5 space-y-5">
            {/* Who + how to reach them */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words">
                    {ctx.party
                      ? <Link href={`/${ctx.party.kind === "customer" ? "customers" : ctx.party.kind === "lead" ? "leads" : "contacts"}/${ctx.party.id}`}
                          className="hover:underline">{ctx.party.name}</Link>
                      : <span className="text-muted-foreground">Unknown number</span>}
                  </p>
                  <p className="ch-mono text-sm text-muted-foreground">{formatAuPhone(other)}</p>
                  {ctx.party?.email && <p className="text-sm text-muted-foreground break-words">{ctx.party.email}</p>}
                  {ctx.party?.company && <p className="text-sm text-muted-foreground">{ctx.party.company}</p>}
                </div>
                {ctx.party && <span className="ch-pill draft capitalize">{ctx.party.kind}</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={async () => {
                  try { await placeCall(other ?? ""); toast.success("Calling — your handset will ring first"); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't place the call"); }
                }}>
                  <Phone className="mr-1.5 h-3.5 w-3.5" /> Call back
                </Button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                {ctx.call.direction} · {ctx.call.status} ·{" "}
                {new Date(ctx.call.started_at).toLocaleString("en-AU")}
                {ctx.call.duration_seconds ? ` · ${ctx.call.duration_seconds}s` : ""}
                {ctx.call.user_name ? ` · handled by ${ctx.call.user_name}` : ""}
              </p>
            </div>

            {/* Unknown caller → make them a customer, and adopt their history */}
            {!ctx.party && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-semibold">Not on file</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Save them as a customer — every past call from this number links up too.
                </p>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="cname">Name</Label>
                    <Input id="cname" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Their name" />
                  </div>
                  <div>
                    <Label htmlFor="cemail">Email (optional)</Label>
                    <Input id="cemail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  </div>
                  <Button size="sm" disabled={!newName.trim()} onClick={async () => {
                    try {
                      const r = await createCustomerFromCall(ctx.call.id, newName, newEmail);
                      toast.success(r.linkedCalls > 1
                        ? `Customer created — ${r.linkedCalls} calls linked`
                        : "Customer created");
                      onClose(); router.refresh();
                    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create"); }
                  }}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Create customer
                  </Button>
                </div>
              </div>
            )}

            {/* What's already open for them — the "active tickets" equivalent */}
            {ctx.party?.kind === "customer" && (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mb-2 text-sm font-semibold">Open for this customer</p>
                {ctx.workOrders.length + ctx.quotes.length + ctx.invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing open.</p>
                ) : (
                  <div className="space-y-1.5 text-sm">
                    {ctx.workOrders.map((w) => (
                      <Link key={w.id} href={`/work-orders/${w.id}`} className="flex justify-between gap-3 hover:underline">
                        <span className="break-words">{w.title || w.number || "Job"}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{w.status}</span>
                      </Link>
                    ))}
                    {ctx.quotes.map((q) => (
                      <Link key={q.id} href={`/quotes/${q.id}`} className="flex justify-between gap-3 hover:underline">
                        <span>Quote {q.number ?? ""}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{money(q.total)} · {q.status}</span>
                      </Link>
                    ))}
                    {ctx.invoices.map((i) => (
                      <Link key={i.id} href={`/invoices/${i.id}`} className="flex justify-between gap-3 hover:underline">
                        <span>Invoice {i.number ?? ""}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {money(Number(i.total) - Number(i.amount_paid))} owing
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {ctx.recentCalls.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mb-2 text-sm font-semibold">Other calls from this number</p>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {ctx.recentCalls.map((c) => (
                    <p key={c.id}>
                      {new Date(c.started_at).toLocaleDateString("en-AU")} · {c.direction} · {c.status}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Notes — the action existed from day one with nothing calling it */}
            <div className="rounded-xl border border-border bg-card p-4">
              <Label htmlFor="call-notes">What was discussed</Label>
              <Textarea id="call-notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Quoted the gutter repair, sending Thursday…" />
              <Button size="sm" className="mt-2" disabled={saving} onClick={async () => {
                setSaving(true);
                try { await setCallNotes(ctx.call.id, notes); toast.success("Saved"); router.refresh(); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
                finally { setSaving(false); }
              }}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save notes
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
