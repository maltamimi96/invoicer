"use client";

import { useConfirm } from "@/components/ui/confirm";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { Plus, Repeat, Pause, Play, Trash2, Edit2, CreditCard, Zap } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LineItemsEditor } from "@/components/invoices/line-items-editor";
import { formatCurrency } from "@/lib/utils";
import {
  createRecurringInvoice, updateRecurringInvoice, setRecurringInvoiceActive,
  deleteRecurringInvoice, runRecurringInvoiceNow,
} from "@/lib/actions/recurring-invoices";
import type { RecurringInvoice, RecurringJobCadence, Customer, Product, LineItem } from "@/types/database";

const CADENCES: { value: RecurringJobCadence; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

interface Props {
  initial: RecurringInvoice[];
  customers: Customer[];
  products: Product[];
  currency: string;
  stripeEnabled: boolean;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function emptyForm() {
  return {
    id: undefined as string | undefined,
    name: "",
    customer_id: "",
    line_items: [] as LineItem[],
    cadence: "monthly" as RecurringJobCadence,
    next_run_on: todayISO(),
    due_days: 14,
    auto_charge: true,
    send_email: true,
    ends_on: "",
    notes: "",
    terms: "",
  };
}

export function RecurringInvoicesClient({ initial, customers, products, currency, stripeEnabled }: Props) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const cardOnFile = (id: string) => !!customers.find((c) => c.id === id)?.stripe_payment_method_id;

  const openNew = () => { setForm(emptyForm()); setOpen(true); };
  const openEdit = (r: RecurringInvoice) => {
    setForm({
      id: r.id, name: r.name, customer_id: r.customer_id, line_items: r.line_items ?? [],
      cadence: r.cadence, next_run_on: r.next_run_on, due_days: r.due_days,
      auto_charge: r.auto_charge, send_email: r.send_email, ends_on: r.ends_on ?? "",
      notes: r.notes ?? "", terms: r.terms ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Give the schedule a name");
    if (!form.customer_id) return toast.error("Pick a customer");
    if (!form.line_items.length) return toast.error("Add at least one line item");
    setSaving(true);
    try {
      const payload = {
        name: form.name, customer_id: form.customer_id, line_items: form.line_items,
        cadence: form.cadence, next_run_on: form.next_run_on, due_days: Number(form.due_days) || 14,
        auto_charge: form.auto_charge, send_email: form.send_email,
        ends_on: form.ends_on || null, notes: form.notes || null, terms: form.terms || null,
      };
      if (form.id) await updateRecurringInvoice(form.id, payload);
      else await createRecurringInvoice(payload);
      toast.success(form.id ? "Schedule updated" : "Recurring invoice created");
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally { setSaving(false); }
  };

  const toggleActive = async (r: RecurringInvoice) => {
    setBusyId(r.id);
    try { await setRecurringInvoiceActive(r.id, !r.active); refresh(); }
    catch { toast.error("Couldn't update"); }
    finally { setBusyId(null); }
  };

  const runNow = async (r: RecurringInvoice) => {
    // When auto_charge is on this bills a real customer immediately — worth a
    // dialog that says so plainly rather than a browser prompt.
    if (!(await confirm({
      title: `Run "${r.name}" now?`,
      body: r.auto_charge
        ? "An invoice will be generated AND the customer's saved card charged immediately. This is outside the normal schedule."
        : "An invoice will be generated now and emailed to the customer, outside the normal schedule.",
      confirmLabel: r.auto_charge ? "Generate and charge" : "Generate now",
      destructive: false,
    }))) return;
    setBusyId(r.id);
    try {
      const res = await runRecurringInvoiceNow(r.id);
      toast.success(`${res.number} created${res.charged ? " + charged" : res.emailed ? " + emailed" : ""}`);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't run"); }
    finally { setBusyId(null); }
  };

  const total = form.line_items.reduce((s, li) => s + Number(li.total ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Recurring invoices"
        subtitle="Auto-generate and auto-charge invoices on a schedule"
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1.5" /> New schedule</Button>}
      />

      {!stripeEnabled && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Connect Stripe (Settings → Payment) so recurring invoices can auto-charge saved cards. Until then they&apos;ll be emailed with a pay link.
        </div>
      )}

      {initial.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Repeat className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No recurring invoices yet</p>
          <p className="text-sm mt-1">Create one to bill a customer automatically every cycle.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {initial.map((r) => (
            <Card key={r.id} className={r.active ? "" : "opacity-60"}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{r.name}</p>
                    <p className="text-sm text-muted-foreground break-words">{customerName(r.customer_id)}</p>
                  </div>
                  <Badge variant="secondary" className={r.active ? "bg-emerald-500/15 text-emerald-600" : ""}>{r.active ? "Active" : "Paused"}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold tabular-nums">{formatCurrency(r.total, currency)}</span>
                  <span className="text-muted-foreground capitalize">{r.cadence}</span>
                  <span className="text-muted-foreground">Next: {r.next_run_on}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {r.auto_charge ? (
                    <span className={`inline-flex items-center gap-1 ${cardOnFile(r.customer_id) ? "text-emerald-600" : "text-amber-600"}`}>
                      <CreditCard className="w-3 h-3" /> {cardOnFile(r.customer_id) ? "Auto-charges saved card" : "Autopay on — no card saved yet"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Emails invoice</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <Button size="sm" variant="outline" onClick={() => runNow(r)} disabled={busyId === r.id}>
                    <Zap className="w-3.5 h-3.5 mr-1" /> Run now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(r)} disabled={busyId === r.id}>
                    {r.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Edit2 className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Edit recurring invoice" : "New recurring invoice"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Schedule name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly maintenance — Acme" />
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <SearchableSelect
                value={form.customer_id}
                onValueChange={(v) => setForm({ ...form, customer_id: v })}
                items={customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.email ?? undefined }))}
                placeholder="Select customer"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Line items</Label>
              <LineItemsEditor items={form.line_items} products={products} currency={currency} onChange={(items) => setForm({ ...form, line_items: items })} />
              <p className="text-right text-sm font-semibold">Total per invoice: {formatCurrency(total, currency)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={form.cadence} onValueChange={(v) => setForm({ ...form, cadence: v as RecurringJobCadence })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CADENCES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Payment terms (days)</Label>
                <Input type="number" min="0" value={form.due_days} onChange={(e) => setForm({ ...form, due_days: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>First invoice date</Label>
                <DatePicker value={form.next_run_on} onChange={(v) => setForm({ ...form, next_run_on: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Ends on (optional)</Label>
                <DatePicker value={form.ends_on} onChange={(v) => setForm({ ...form, ends_on: v })} clearable />
              </div>
            </div>
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-normal">Auto-charge saved card</Label>
                  <p className="text-xs text-muted-foreground">Charge the customer&apos;s card on file automatically each cycle.</p>
                </div>
                <Switch checked={form.auto_charge} onCheckedChange={(v) => setForm({ ...form, auto_charge: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-normal">Email the invoice</Label>
                  <p className="text-xs text-muted-foreground">Send the invoice (with a pay link) when auto-charge isn&apos;t possible.</p>
                </div>
                <Switch checked={form.send_email} onCheckedChange={(v) => setForm({ ...form, send_email: v })} />
              </div>
              {form.auto_charge && form.customer_id && !cardOnFile(form.customer_id) && (
                <p className="text-xs text-amber-600">This customer has no saved card yet — they&apos;ll be emailed a link to save one / pay until they do.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Create schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recurring invoice?</AlertDialogTitle>
            <AlertDialogDescription>This stops future automatic invoices. Invoices already created are unaffected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (deleteId) { try { await deleteRecurringInvoice(deleteId); toast.success("Deleted"); refresh(); } catch { toast.error("Couldn't delete"); } setDeleteId(null); } }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
