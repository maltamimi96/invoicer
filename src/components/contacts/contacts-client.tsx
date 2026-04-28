"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Mail, Phone, Building2, Search, MoreHorizontal,
  Trash2, TrendingUp, User,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const STAGE_BADGE: Record<LifecycleStage, string> = {
  lead:     "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  contact:  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  customer: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

const STAGES: LifecycleStage[] = ["lead", "contact", "customer"];

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {counts.total} total · {counts.lead} leads · {counts.contact} contacts · {counts.customer} customers
          </p>
        </div>
        <Button onClick={() => { setForm(EMPTY); setShowAdd(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Contact
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as LifecycleStage | "all")}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No contacts {search || stageFilter !== "all" ? "match your filter" : "yet — add one or promote a lead"}.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{c.name}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => startEdit(c)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handlePromote(c.id)}
                        disabled={!!c.customer_id || promoting === c.id}
                      >
                        <TrendingUp className="h-3.5 w-3.5 mr-2" />
                        {c.customer_id ? "Customer ✓" : "Promote to customer"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteId(c.id)} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={STAGE_BADGE[c.lifecycle_stage]} variant="secondary">
                    {c.lifecycle_stage}
                  </Badge>
                  {c.tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                  ))}
                </div>

                <div className="space-y-1">
                  {c.company && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{c.company}</span>
                    </div>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="truncate">{c.phone}</span>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog
        open={showAdd || !!editing}
        onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null); } }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Contact" : "Add Contact"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
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
              <Label>Tags (comma-separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="vip, follow-up" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={editing ? handleEditSave : handleAdd} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive contact?</AlertDialogTitle>
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
