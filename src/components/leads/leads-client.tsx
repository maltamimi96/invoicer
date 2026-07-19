"use client";

/**
 * The leads workspace.
 *
 * One orchestrator owning lead state, the shared dialogs and every mutation;
 * three views rendering it. The board answers "where is this lead up to", the
 * list "show me all of them without scrolling five columns", the calendar
 * "when did the work come in".
 *
 * The old page was the board alone, with six gradient KPI tiles restating the
 * five column counts directly beneath them. The KPIs here are the four numbers
 * the columns and filter tabs DON'T already give you.
 */

import { useState, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Plus, Search, TrendingUp, Users, Sparkles, CheckCircle,
  LayoutGrid, ListChecks, Calendar as CalendarIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { CleanupButton } from "@/components/cleanup/cleanup-button";
import { StatTile, AnimatedPress, FadeIn } from "@/components/ui/kirei";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { LeadsBoard } from "./leads-board";
import { LeadsList } from "./leads-list";
import { LeadsCalendar } from "./leads-calendar";
import { formatSourceLabel, type ConvertTarget, type LeadActionHandlers } from "./lead-shared";
import {
  updateLeadStatus, deleteLead, createLead, updateLead,
  convertLeadToCustomer, convertLeadToQuote, convertLeadToWorkOrder,
} from "@/lib/actions/leads";
import { addLeadAsContact } from "@/lib/actions/contacts";
import type { Lead, LeadStatus, LeadSource } from "@/types/database";
import { BUILT_IN_LEAD_SOURCES } from "@/types/database";

type View = "board" | "list" | "calendar";
const VIEWS: { id: View; label: string; icon: typeof LayoutGrid }[] = [
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "list", label: "List", icon: ListChecks },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
];

interface NewLeadForm {
  name: string; phone: string; email: string; suburb: string;
  service: string; property_type: string; timing: string; notes: string;
  source: LeadSource;
}

const EMPTY_FORM: NewLeadForm = {
  name: "", phone: "", email: "", suburb: "",
  service: "", property_type: "", timing: "", notes: "", source: "manual",
};

export function LeadsClient({ leads: initial }: { leads: Lead[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [leads, setLeads] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<NewLeadForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState<Partial<Lead>>({});

  // View lives in the URL so it survives a refresh and can be linked to —
  // same pattern as the Content Studio hub.
  const view = (params.get("view") as View) ?? "board";
  const setView = (v: View) => router.replace(`${pathname}?view=${v}`, { scroll: false });

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter((l) =>
      `${l.name} ${l.email ?? ""} ${l.phone ?? ""} ${l.suburb ?? ""} ${l.service ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [leads, search]);

  const stats = useMemo(() => {
    const total = leads.length;
    const won = leads.filter((l) => l.status === "won").length;
    return {
      total,
      new: leads.filter((l) => l.status === "new").length,
      won,
      conversion: total > 0 ? Math.round((won / total) * 100) : 0,
    };
  }, [leads]);

  // ── mutations ─────────────────────────────────────────────────────────────

  const handleMove = async (id: string, status: LeadStatus) => {
    const before = leads;
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await updateLeadStatus(id, status);
    } catch {
      toast.error("Couldn't update the status");
      setLeads(before); // revert to what was actually on screen, not the
                        // server's first response — the user may have made
                        // other edits since the page loaded.
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteLead(deleteId);
      setLeads((prev) => prev.filter((l) => l.id !== deleteId));
      toast.success("Lead deleted");
    } catch {
      toast.error("Couldn't delete the lead");
    }
    setDeleteId(null);
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error("A name is required"); return; }
    setSaving(true);
    try {
      const lead = await createLead({
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        suburb: form.suburb || null,
        service: form.service || null,
        property_type: form.property_type || null,
        timing: form.timing || null,
        notes: form.notes || null,
        source: form.source,
      });
      setLeads((prev) => [lead, ...prev]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      toast.success("Lead added");
    } catch {
      toast.error("Couldn't add the lead");
    }
    setSaving(false);
  };

  const handleAddAsContact = async (id: string) => {
    setBusyId(id);
    try {
      await addLeadAsContact(id);
      toast.success("Added as contact");
      router.push("/contacts");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add as a contact");
    } finally {
      setBusyId(null);
    }
  };

  const handleConvert = async (id: string, target: ConvertTarget) => {
    setBusyId(id);
    try {
      if (target === "customer") {
        const { customer_id } = await convertLeadToCustomer(id);
        setLeads((prev) => prev.map((l) =>
          l.id === id ? { ...l, customer_id, status: l.status === "new" ? "contacted" : l.status } : l
        ));
        toast.success("Customer created");
        router.push(`/customers/${customer_id}`);
      } else if (target === "quote") {
        const { quote_id, customer_id } = await convertLeadToQuote(id);
        setLeads((prev) => prev.map((l) =>
          l.id === id ? { ...l, customer_id, quote_id, status: "quoted" } : l
        ));
        toast.success("Draft quote created");
        router.push(`/quotes/${quote_id}`);
      } else {
        const { work_order_id, customer_id } = await convertLeadToWorkOrder(id);
        setLeads((prev) => prev.map((l) =>
          l.id === id ? { ...l, customer_id, status: "won" } : l
        ));
        toast.success("Work order created");
        router.push(`/work-orders/${work_order_id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (id: string) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    setEditLead(lead);
    setEditForm({
      name: lead.name, phone: lead.phone, email: lead.email, suburb: lead.suburb,
      service: lead.service, property_type: lead.property_type, timing: lead.timing,
      notes: lead.notes,
    });
  };

  const handleEditSave = async () => {
    if (!editLead) return;
    setSaving(true);
    try {
      await updateLead(editLead.id, editForm);
      setLeads((prev) => prev.map((l) => (l.id === editLead.id ? { ...l, ...editForm } : l)));
      setEditLead(null);
      toast.success("Lead updated");
    } catch {
      toast.error("Couldn't update the lead");
    }
    setSaving(false);
  };

  const handlers: LeadActionHandlers = {
    onMove: handleMove,
    onEdit: openEdit,
    onDelete: (id) => setDeleteId(id),
    onConvert: handleConvert,
    onAddAsContact: handleAddAsContact,
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        subtitle={`${stats.total} total · ${stats.new} awaiting first contact`}
        accent="linear-gradient(180deg, #60a5fa 0%, #1d4ed8 100%)"
        actions={
          <>
            <CleanupButton entity="leads" entityLabel="leads" />
            <AnimatedPress
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add lead
            </AnimatedPress>
          </>
        }
      />

      {/* Four KPIs — the numbers the board columns and list tabs don't repeat. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: <Users className="w-3.5 h-3.5" />, label: "Total leads", value: String(stats.total), sub: "all time", gradient: "softBlue" as const, tone: "#1e3a8a" },
          { icon: <Sparkles className="w-3.5 h-3.5" />, label: "New", value: String(stats.new), sub: "need first contact", gradient: "softAmber" as const, tone: "#78350f" },
          { icon: <CheckCircle className="w-3.5 h-3.5" />, label: "Won", value: String(stats.won), sub: "converted", gradient: "softTeal" as const, tone: "#064e3b" },
          { icon: <TrendingUp className="w-3.5 h-3.5" />, label: "Conv. rate", value: `${stats.conversion}%`, sub: "won / total", gradient: "softViolet" as const, tone: "#3b1d6b" },
        ].map((k, i) => (
          <FadeIn key={k.label} delay={60 + i * 40}>
            <StatTile
              gradient={k.gradient}
              toneColor={k.tone}
              icon={k.icon}
              label={k.label}
              value={k.value}
              sub={k.sub}
            />
          </FadeIn>
        ))}
      </div>

      {/* View switcher + search */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border">
          {VIEWS.map((v) => {
            const active = view === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="leads-view-pill"
                    className="absolute inset-0 rounded-lg bg-background shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <v.icon className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">{v.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-auto sm:min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl"
          />
        </div>
      </div>

      {/* The active view */}
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {view === "board" && <LeadsBoard leads={filtered} busyId={busyId} handlers={handlers} />}
          {view === "list" && <LeadsList leads={filtered} busyId={busyId} handlers={handlers} />}
          {view === "calendar" && <LeadsCalendar leads={filtered} busyId={busyId} handlers={handlers} />}
        </motion.div>
      </AnimatePresence>

      {/* Add */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="col-span-full space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="John Smith" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0400 000 000" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="john@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Suburb</Label>
              <Input value={form.suburb} onChange={(e) => setForm((f) => ({ ...f, suburb: e.target.value }))} placeholder="Sydney" />
            </div>
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Input value={form.service} onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))} placeholder="Gutter cleaning" />
            </div>
            <div className="space-y-1.5">
              <Label>Property type</Label>
              <Input value={form.property_type} onChange={(e) => setForm((f) => ({ ...f, property_type: e.target.value }))} placeholder="Residential" />
            </div>
            <div className="space-y-1.5">
              <Label>Timing</Label>
              <Input value={form.timing} onChange={(e) => setForm((f) => ({ ...f, timing: e.target.value }))} placeholder="ASAP" />
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Input
                list="lead-source-suggestions"
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="e.g. HiPages, referral, walk-in"
              />
              <datalist id="lead-source-suggestions">
                {BUILT_IN_LEAD_SOURCES.map((s) => (
                  <option key={`builtin-${s}`} value={s}>{formatSourceLabel(s)}</option>
                ))}
                {/* Sources already on this business's leads, so typing 'Hi…'
                    autocompletes to a value that's actually been used. */}
                {Array.from(new Set(leads.map((l) => l.source).filter(Boolean) as string[]))
                  .filter((s) => !(BUILT_IN_LEAD_SOURCES as readonly string[]).includes(s))
                  .map((s) => <option key={`past-${s}`} value={s}>{formatSourceLabel(s)}</option>)}
              </datalist>
              <p className="text-[11px] text-muted-foreground">Pick a suggestion or type your own.</p>
            </div>
            <div className="col-span-full space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Anything else worth knowing…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Saving…" : "Add lead"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editLead} onOpenChange={(o) => { if (!o) setEditLead(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="col-span-full space-y-1.5">
              <Label>Name *</Label>
              <Input value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={editForm.phone ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={editForm.email ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Suburb</Label>
              <Input value={editForm.suburb ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, suburb: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Input value={editForm.service ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, service: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Property type</Label>
              <Input value={editForm.property_type ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, property_type: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Timing</Label>
              <Input value={editForm.timing ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, timing: e.target.value }))} />
            </div>
            <div className="col-span-full space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLead(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
