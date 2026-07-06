"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, ClipboardList, Send, Trash2, Copy, Loader2, Eye } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  setOnboardingEnabled, createOnboardingForm, deleteOnboardingForm,
  sendOnboardingRequest, deleteOnboardingRequest, type OnboardingRequestRow,
} from "@/lib/actions/onboarding";
import { formatDate } from "@/lib/utils";
import type { OnboardingForm, Customer } from "@/types/database";

const STATUS_TONES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  archived: "bg-muted text-muted-foreground line-through",
  pending: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  viewed: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

interface Props {
  enabled: boolean;
  forms: (OnboardingForm & { request_count: number; completed_count: number })[];
  requests: OnboardingRequestRow[];
  customers: Customer[];
}

export function OnboardingFormsClient({ enabled, forms, requests, customers }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sendForm, setSendForm] = useState<OnboardingForm | null>(null);
  const [sendCustomer, setSendCustomer] = useState("");
  const [tab, setTab] = useState<"forms" | "requests">("forms");

  // ── Disabled: enable card (plugin off) ────────────────────────────────────
  if (!enabled) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 via-cyan-500 to-sky-500 flex items-center justify-center text-white mx-auto">
              <ClipboardList className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Client Onboarding</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Build custom intake forms — ABN, social accounts, opening hours, brand images,
                even securely-stored credentials — and send customers a link to fill them in.
                Answers are saved to the customer&apos;s profile.
              </p>
            </div>
            <Button
              className="mt-2"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try { await setOnboardingEnabled(true); toast.success("Client Onboarding enabled"); router.refresh(); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't enable"); }
                finally { setBusy(false); }
              }}
            >
              {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Enable Client Onboarding
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const create = async () => {
    if (!name.trim()) return toast.error("Give the form a name");
    setBusy(true);
    try {
      const form = await createOnboardingForm({ name: name.trim(), description: description.trim() || null });
      toast.success("Form created — now add your fields");
      setNewOpen(false); setName(""); setDescription("");
      router.push(`/onboarding-forms/${form.id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create form"); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!sendForm || !sendCustomer) return toast.error("Pick a customer");
    setBusy(true);
    try {
      const { url } = await sendOnboardingRequest(sendForm.id, sendCustomer);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Sent — link also copied to your clipboard");
      setSendForm(null); setSendCustomer("");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
    finally { setBusy(false); }
  };

  const copyLink = async (formId: string, customerId: string) => {
    try {
      const { url } = await sendOnboardingRequest(formId, customerId, { email: false });
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't get link"); }
  };

  return (
    <div>
      <PageHeader
        title="Client Onboarding"
        subtitle="Custom intake forms your customers fill in through their portal"
        accent="linear-gradient(180deg, #2dd4bf 0%, #0e7490 100%)"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked
                onCheckedChange={async (v) => {
                  if (v) return;
                  try { await setOnboardingEnabled(false); toast.success("Client Onboarding disabled"); router.refresh(); }
                  catch { toast.error("Couldn't disable"); }
                }}
              />
              Enabled
            </div>
            <Button onClick={() => setNewOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> New form</Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {(["forms", "requests"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t === "forms" ? `Forms (${forms.length})` : `Sent (${requests.length})`}
          </button>
        ))}
      </div>

      {tab === "forms" ? (
        forms.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No forms yet</p>
            <p className="text-sm mt-1">Create your first onboarding form — every business collects different things.</p>
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {forms.map((f) => (
              <Card key={f.id} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/onboarding-forms/${f.id}`} className="font-semibold hover:underline break-words">{f.name}</Link>
                    <Badge variant="secondary" className={STATUS_TONES[f.status] ?? ""}>{f.status}</Badge>
                  </div>
                  {f.description && <p className="text-xs text-muted-foreground break-words">{f.description}</p>}
                  <p className="text-xs text-muted-foreground">
                    {f.schema.length} field{f.schema.length === 1 ? "" : "s"} · {f.completed_count}/{f.request_count} completed
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-8" disabled={f.schema.length === 0} asChild>
                      <Link href={`/onboarding-forms/${f.id}?view=1`}><Eye className="w-3.5 h-3.5 mr-1" /> View</Link>
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" asChild>
                      <Link href={`/onboarding-forms/${f.id}`}>Edit</Link>
                    </Button>
                    <Button size="sm" className="h-8" disabled={f.schema.length === 0}
                      onClick={() => { setSendForm(f); setSendCustomer(""); }}>
                      <Send className="w-3.5 h-3.5 mr-1" /> Send
                    </Button>
                    <button
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        if (!confirm(`Delete "${f.name}" and all its responses?`)) return;
                        try { await deleteOnboardingForm(f.id); toast.success("Deleted"); router.refresh(); }
                        catch { toast.error("Delete failed"); }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : requests.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Send className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nothing sent yet</p>
          <p className="text-sm mt-1">Send a form to a customer and track their progress here.</p>
        </CardContent></Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Customer</th>
                <th className="text-left px-4 py-3 font-semibold">Form</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Sent</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-3 break-words">{r.customers?.name ?? "—"}</td>
                  <td className="px-4 py-3 break-words">{r.onboarding_forms?.name ?? "—"}</td>
                  <td className="px-4 py-3"><Badge variant="secondary" className={STATUS_TONES[r.status] ?? ""}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.sent_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {r.status === "completed" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                          <Link href={`/onboarding-forms/${r.form_id}?response=${r.id}`}>View answers</Link>
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copyLink(r.form_id, r.customer_id)}>
                          <Copy className="w-3 h-3 mr-1" /> Copy link
                        </Button>
                      )}
                      <button className="text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          if (!confirm("Delete this request (and any answers)?")) return;
                          try { await deleteOnboardingRequest(r.id); router.refresh(); }
                          catch { toast.error("Delete failed"); }
                        }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* New form dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New onboarding form</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Client Intake" />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown to the customer at the top of the form" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Create & build</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send dialog */}
      <Dialog open={!!sendForm} onOpenChange={(v) => !v && setSendForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send “{sendForm?.name}”</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <SearchableSelect
              value={sendCustomer}
              onValueChange={setSendCustomer}
              items={customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.email ?? undefined }))}
              placeholder="Select customer"
            />
            <p className="text-xs text-muted-foreground pt-1">
              They&apos;ll get an email with a secure portal link — no login needed. The link is also copied to your clipboard.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSendForm(null)}>Cancel</Button>
            <Button
              variant="outline" disabled={busy || !sendCustomer}
              onClick={async () => {
                if (!sendForm || !sendCustomer) return;
                setBusy(true);
                try {
                  const { url } = await sendOnboardingRequest(sendForm.id, sendCustomer, { email: false });
                  await navigator.clipboard.writeText(url);
                  toast.success("Share link copied — send it however you like");
                  setSendForm(null); setSendCustomer("");
                  router.refresh();
                } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create link"); }
                finally { setBusy(false); }
              }}
            >
              <Copy className="w-4 h-4 mr-1.5" /> Copy link
            </Button>
            <Button onClick={send} disabled={busy || !sendCustomer}>
              {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
