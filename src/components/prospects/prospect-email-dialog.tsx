"use client";

import { useState, useTransition } from "react";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { emailProspects } from "@/lib/actions/prospects";

export function ProspectEmailDialog({ open, onOpenChange, prospectIds }: { open: boolean; onOpenChange: (o: boolean) => void; prospectIds: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // refresh() after an await runs OUTSIDE the transition, so the
  // spinner stopped while the server was still re-rendering. See
  // components/layout/use-mutation.tsx.
  const { refresh } = useTrackedRefresh();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  function send() {
    if (!subject.trim() || !body.trim()) { toast.error("Subject and message are required"); return; }
    startTransition(async () => {
      try {
        const r = await emailProspects(prospectIds, subject, body);
        toast.success(`Sent ${r.sent}${r.skipped ? `, skipped ${r.skipped}` : ""}${r.failed ? `, ${r.failed} failed` : ""}`);
        onOpenChange(false); setSubject(""); setBody("");
        refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "Send failed"); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{prospectIds.length > 1 ? `Reach out to ${prospectIds.length} prospects` : "Send email"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="pe-subject">Subject</Label><Input id="pe-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Quick question, {{first_name}}" /></div>
          <div className="space-y-1.5"><Label htmlFor="pe-body">Message</Label><Textarea id="pe-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Hi {{first_name}},\n\n…\n\nCheers"} /></div>
          <p className="text-[11px] text-muted-foreground">Merge fields: <code>{"{{first_name}}"}</code> <code>{"{{name}}"}</code> <code>{"{{company}}"}</code>. An unsubscribe link is added automatically; suppressed contacts are skipped.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={send} disabled={isPending}>{isPending ? "Sending…" : "Send"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
