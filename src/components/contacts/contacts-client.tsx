"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Mail, Phone, Search, MoreHorizontal,
  Trash2, TrendingUp,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { CleanupButton } from "@/components/cleanup/cleanup-button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createContact, updateContact, archiveContact, promoteContactToCustomer,
} from "@/lib/actions/contacts";
import type { Contact, LifecycleStage } from "@/types/database";

const STAGES: LifecycleStage[] = ["lead", "contact", "customer"];

const STAGE_DOT: Record<LifecycleStage, string> = {
  lead:     "bg-blue-500",
  contact:  "bg-amber-500",
  customer: "bg-emerald-600",
};

type Form = {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
  tags: string;
  lifecycle_stage: LifecycleStage;
};

const EMPTY: Form = { name: "", email: "", phone: "", company: "", notes: "", tags: "", lifecycle_stage: "contact" };

function formToPayload(f: Form) {
  return {
    name: f.name,
    email: f.email || null,
    phone: f.phone || null,
    company: f.company || null,
    notes: f.notes || null,
    tags: f.tags ? f.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    lifecycle_stage: f.lifecycle_stage,
  };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function ContactsClient({ contacts: initial }: { contacts: Contact[] }) {
  const router = useRouter();
  const [contacts, setContacts] = useState(initial);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LifecycleStage | "all">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);

  const filtered = contacts.filter((c) => {
    if (stageFilter !== "all" && c.lifecycle_stage !== stageFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.company ?? ""}`.toLowerCase().includes(q);
  });

  const counts = {
    total: contacts.length,
    lead: contacts.filter((c) => c.lifecycle_stage === "lead").length,
    contact: contacts.filter((c) => c.lifecycle_stage === "contact").length,
    customer: contacts.filter((c) => c.lifecycle_stage === "customer").length,
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const c = await createContact(formToPayload(form));
      setContacts((prev) => [c, ...prev]);
      setForm(EMPTY);
      setShowAdd(false);
      toast.success("Contact added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add contact");
    }
    setSaving(false);
  };

  const handleEditSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const c = await updateContact(editing.id, formToPayload(form));
      setContacts((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      setEditing(null);
      toast.success("Contact updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await archiveContact(deleteId);
      setContacts((prev) => prev.filter((c) => c.id !== deleteId));
      toast.success("Contact archived");
    } catch { toast.error("Failed to archive"); }
    setDeleteId(null);
  };

  const handlePromote = async (id: string) => {
    setPromoting(id);
    try {
      const { contact, customerId } = await promoteContactToCustomer(id);
      setContacts((prev) => prev.map((c) => (c.id === id ? contact : c)));
      toast.success("Promoted to customer");
      router.push(`/customers/${customerId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promotion failed");
    } finally {
      setPromoting(null);
    }
  };

  const startEdit = (c: Contact) => {
    setEditing(c);
    setForm({
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      company: c.company ?? "",
      notes: c.notes ?? "",
      tags: c.tags.join(", "),
      lifecycle_stage: c.lifecycle_stage,
    });
  };

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={`${counts.total} total · ${counts.lead} leads · ${counts.contact} contacts · ${counts.customer} customers`}
        actions={
          <>
            <CleanupButton entity="contacts" entityLabel="contacts" />
            <button
              onClick={() => { setForm(EMPTY); setShowAdd(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" /> New contact
            </button>
          </>
        }
      />

      {/* Filter row */}
      <div className="flex flex-col sm:flex-row gap-3 border-b border-border pb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-card border-border focus-visible:ring-1 focus-visible:ring-accent"
          />
        </div>
        <div className="flex items-center gap-1 text-sm">
          {(["all", ...STAGES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`px-3 h-9 rounded-md transition-colors ${
                stageFilter === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-display text-2xl font-semibold text-muted-foreground">
            No contacts {search || stageFilter !== "all" ? "match your filter" : "yet"}
          </p>
          {(!search && stageFilter === "all") && (
            <p className="text-sm text-muted-foreground mt-3">
              Add one, or promote a lead from <a href="/leads" className="text-accent underline-offset-4 hover:underline">/leads</a>.
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((c) => (
            <li key={c.id} className="group py-4 flex items-center gap-4">
              {/* Avatar */}
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-foreground/70 shrink-0">
                {initials(c.name) || "·"}
              </div>

              {/* Main */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{c.name}</span>
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STAGE_DOT[c.lifecycle_stage]}`} />
                  <span className="text-xs text-muted-foreground capitalize">{c.lifecycle_stage}</span>
                  {c.tags.map((t) => (
                    <span key={t} className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                  {c.company && <span className="truncate">{c.company}</span>}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-foreground truncate">
                      <Mail className="h-3 w-3 shrink-0" /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-1 hover:text-foreground">
                      <Phone className="h-3 w-3 shrink-0" /> {c.phone}
                    </a>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePromote(c.id)}
                  disabled={!!c.customer_id || promoting === c.id}
                  className="h-8 text-xs"
                >
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                  {c.customer_id ? "Customer" : "Promote"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => startEdit(c)}>Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteId(c.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add / Edit Dialog */}
      <Dialog
        open={showAdd || !!editing}
        onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null); } }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold">
              {editing ? "Edit contact" : "New contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Company</Label>
              <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Stage</Label>
              <Select value={form.lifecycle_stage} onValueChange={(v) => setForm((f) => ({ ...f, lifecycle_stage: v as LifecycleStage }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tags</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="comma, separated"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowAdd(false); setEditing(null); }}>Cancel</Button>
            <Button
              onClick={editing ? handleEditSave : handleAdd}
              disabled={saving}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Add contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl font-bold">Archive contact?</AlertDialogTitle>
            <AlertDialogDescription>You can restore it from the database if needed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
