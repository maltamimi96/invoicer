"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Trash2, UserPlus, Check, Send } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { updateProspect, deleteProspect, convertProspectToLead, addProspectNote } from "@/lib/actions/prospects";
import { ProspectEmailDialog } from "@/components/prospects/prospect-email-dialog";
import type { Prospect, ProspectStatus } from "@/types/database";

interface Activity { id: string; type: string; summary: string; created_at: string }

const STATUSES: ProspectStatus[] = ["new", "contacted", "responded", "qualified", "unqualified", "converted"];
const TONE: Record<string, string> = {
  new: "bg-muted text-muted-foreground", contacted: "bg-blue-100 text-blue-700", responded: "bg-violet-100 text-violet-700",
  qualified: "bg-emerald-100 text-emerald-700", unqualified: "bg-red-100 text-red-700", converted: "bg-emerald-600 text-white",
};
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function ProspectDetail({ prospect, activities }: { prospect: Prospect; activities: Activity[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [emailOpen, setEmailOpen] = useState(false);
  const [note, setNote] = useState("");

  function saveNote() {
    if (!note.trim()) return;
    startTransition(async () => {
      try { await addProspectNote(prospect.id, note); setNote(""); toast.success("Note added"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add note"); }
    });
  }
  const [f, setF] = useState({
    name: prospect.name ?? "", email: prospect.email ?? "", phone: prospect.phone ?? "", company: prospect.company ?? "",
    title: prospect.title ?? "", website: prospect.website ?? "", source: prospect.source ?? "",
    status: prospect.status, notes: prospect.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const converted = prospect.status === "converted";
  const customFields = Object.entries(prospect.custom_fields ?? {});

  function save() {
    startTransition(async () => {
      try { await updateProspect(prospect.id, { ...f, status: f.status as ProspectStatus }); toast.success("Saved"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    });
  }
  function convert() {
    startTransition(async () => {
      try { const r = await convertProspectToLead(prospect.id); toast.success("Converted to lead"); if (r.lead_id) router.push(`/leads/${r.lead_id}`); else router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't convert"); }
    });
  }
  function remove() {
    startTransition(async () => {
      try { await deleteProspect(prospect.id); toast.success("Deleted"); router.push("/prospects"); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete"); }
    });
  }

  return (
    <>
      <PageHeader
        title={prospect.name || prospect.email || "Prospect"}
        subtitle={<span className={cn("text-[11px] font-medium rounded-full px-2 py-0.5 capitalize", TONE[prospect.status])}>{prospect.status}</span>}
        actions={
          <>
            <Link href="/prospects" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md border border-border px-3 py-1.5"><ArrowLeft className="w-4 h-4" /> Prospects</Link>
            {prospect.email && <Button variant="outline" onClick={() => setEmailOpen(true)} disabled={isPending}><Send className="w-4 h-4 mr-1.5" /> Send email</Button>}
            {!converted && <Button variant="outline" onClick={convert} disabled={isPending}><UserPlus className="w-4 h-4 mr-1.5" /> Convert to lead</Button>}
            {converted && prospect.lead_id && <Link href={`/leads/${prospect.lead_id}`} className="inline-flex items-center gap-1.5 text-sm rounded-md border border-emerald-500/40 text-emerald-700 px-3 py-1.5"><Check className="w-4 h-4" /> View lead</Link>}
          </>
        }
      />

      <div className="max-w-2xl space-y-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" v={f.name} onChange={(v) => set("name", v)} />
            <Field label="Company" v={f.company} onChange={(v) => set("company", v)} />
            <Field label="Email" v={f.email} onChange={(v) => set("email", v)} type="email" />
            <Field label="Phone" v={f.phone} onChange={(v) => set("phone", v)} />
            <Field label="Title" v={f.title} onChange={(v) => set("title", v)} />
            <Field label="Website" v={f.website} onChange={(v) => set("website", v)} />
            <Field label="Source" v={f.source} onChange={(v) => set("source", v)} />
            <div className="space-y-1.5">
              <Label htmlFor="pd-status">Status</Label>
              <select id="pd-status" className={selectCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="pd-notes">Notes</Label><Textarea id="pd-notes" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          <div className="flex justify-between items-center pt-1">
            <button onClick={remove} disabled={isPending} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /> Delete</button>
            <Button onClick={save} disabled={isPending}>Save</Button>
          </div>
        </div>

        {customFields.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-semibold mb-2">Imported fields</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {customFields.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted-foreground truncate">{k}</dt><dd className="break-words">{String(v)}</dd></div>))}
            </dl>
          </div>
        )}

        {/* Activity */}
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold mb-3">Activity</p>
          <div className="flex gap-2 mb-4">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" onKeyDown={(e) => { if (e.key === "Enter") saveNote(); }} />
            <Button variant="outline" onClick={saveNote} disabled={isPending || !note.trim()}>Add</Button>
          </div>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet. Send an email or add a note.</p>
          ) : (
            <ul className="space-y-2">
              {activities.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 mt-0.5 shrink-0", a.type === "email" ? "bg-blue-100 text-blue-700" : a.type === "unsubscribe" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground")}>{a.type}</span>
                  <span className="flex-1 min-w-0 break-words">{a.summary}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(a.created_at).toLocaleDateString("en-AU")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ProspectEmailDialog open={emailOpen} onOpenChange={setEmailOpen} prospectIds={[prospect.id]} />
    </>
  );
}

function Field({ label, v, onChange, type }: { label: string; v: string; onChange: (v: string) => void; type?: string }) {
  const id = `pd-${label.toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type ?? "text"} value={v} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
