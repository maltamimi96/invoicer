"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus, Phone, Mail, MapPin, Clock, MoreHorizontal,
  Trash2, User, TrendingUp, ChevronRight, Search, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { updateLeadStatus, deleteLead, createLead, updateLead, convertLeadToCustomer, convertLeadToQuote, convertLeadToWorkOrder } from "@/lib/actions/leads";
import type { Lead, LeadStatus, LeadSource } from "@/types/database";

const COLUMNS: { status: LeadStatus; label: string; color: string; dot: string }[] = [
  { status: "new",       label: "New",       color: "bg-blue-50 dark:bg-blue-950/30",   dot: "bg-blue-500" },
  { status: "contacted", label: "Contacted", color: "bg-yellow-50 dark:bg-yellow-950/30", dot: "bg-yellow-500" },
  { status: "quoted",    label: "Quoted",    color: "bg-purple-50 dark:bg-purple-950/30", dot: "bg-purple-500" },
  { status: "won",       label: "Won",       color: "bg-green-50 dark:bg-green-950/30",  dot: "bg-green-500" },
  { status: "lost",      label: "Lost",      color: "bg-red-50 dark:bg-red-950/30",     dot: "bg-red-500" },
];

const STATUS_BADGE: Record<LeadStatus, string> = {
  new:       "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  contacted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  quoted:    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  won:       "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  lost:      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  "landing-page": "Landing Page",
  website:        "Website",
  referral:       "Referral",
  telegram:       "Telegram",
  email:          "Email",
  phone:          "Phone",
  manual:         "Manual",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

interface NewLeadForm {
  name: string;
  phone: string;
  email: string;
  suburb: string;
  service: string;
  property_type: string;
  timing: string;
  notes: string;
  source: LeadSource;
}

const EMPTY_FORM: NewLeadForm = {
  name: "", phone: "", email: "", suburb: "",
  service: "", property_type: "", timing: "", notes: "", source: "manual",
};

export function LeadsClient({ leads: initial }: { leads: Lead[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initial);
  const [converting, setConverting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<NewLeadForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState<Partial<Lead>>({});

  const filtered = search
    ? leads.filter((l) =>
        `${l.name} ${l.email ?? ""} ${l.phone ?? ""} ${l.suburb ?? ""} ${l.service ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : leads;

  const byStatus = (status: LeadStatus) => filtered.filter((l) => l.status === status);

  const handleMove = async (id: string, status: LeadStatus) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await updateLeadStatus(id, status);
    } catch {
      toast.error("Failed to update status");
      setLeads(initial);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteLead(deleteId);
      setLeads((prev) => prev.filter((l) => l.id !== deleteId));
      toast.success("Lead deleted");
    } catch { toast.error("Failed to delete lead"); }
    setDeleteId(null);
  };

  const handleAdd = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
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
    } catch { toast.error("Failed to add lead"); }
    setSaving(false);
  };

  const handleConvert = async (id: string, target: "customer" | "quote" | "work_order") => {
    setConverting(id);
    try {
      if (target === "customer") {
        const { customer_id } = await convertLeadToCustomer(id);
        setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, customer_id, status: l.status === "new" ? "contacted" : l.status } : l)));
        toast.success("Customer created");
        router.push(`/customers/${customer_id}`);
      } else if (target === "quote") {
        const { quote_id, customer_id } = await convertLeadToQuote(id);
        setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, customer_id, quote_id, status: "quoted" } : l)));
        toast.success("Draft quote created");
        router.push(`/quotes/${quote_id}`);
      } else {
        const { work_order_id, customer_id } = await convertLeadToWorkOrder(id);
        setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, customer_id, status: "won" } : l)));
        toast.success("Work order created");
        router.push(`/work-orders/${work_order_id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setConverting(null);
    }
  };

  const handleEditSave = async () => {
    if (!editLead) return;
    setSaving(true);
    try {
      await updateLead(editLead.id, editForm);
      setLeads((prev) => prev.map((l) => (l.id === editLead.id ? { ...l, ...editForm } : l)));
      setEditLead(null);
      toast.success("Lead updated");
    } catch { toast.error("Failed to update lead"); }
    setSaving(false);
  };

  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    won: leads.filter((l) => l.status === "won").length,
    lost: leads.filter((l) => l.status === "lost").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {stats.total} total · {stats.new} new · {stats.won} won · {stats.lost} lost
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Lead
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const count = byStatus(col.status).length;
          return (
            <Card key={col.status} className="py-3">
              <CardContent className="px-4 py-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                  <span className="text-sm font-medium capitalize">{col.label}</span>
                </div>
                <p className="text-2xl font-bold mt-1">{count}</p>
              </CardContent>
            </Card>
          );
        })}
        <Card className="py-3">
          <CardContent className="px-4 py-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium">Conv. Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {stats.total > 0 ? Math.round((stats.won / stats.total) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 min-h-[400px]">
        {COLUMNS.map((col) => {
          const colLeads = byStatus(col.status);
          return (
            <div key={col.status} className="flex flex-col gap-2">
              {/* Column header */}
              <div className={`rounded-lg px-3 py-2 flex items-center gap-2 ${col.color}`}>
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                <span className="text-sm font-semibold capitalize">{col.label}</span>
                <span className="ml-auto text-xs font-medium text-muted-foreground bg-background/60 rounded px-1.5 py-0.5">
                  {colLeads.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2">
                {colLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    converting={converting === lead.id}
                    onMove={handleMove}
                    onDelete={() => setDeleteId(lead.id)}
                    onEdit={() => { setEditLead(lead); setEditForm({ name: lead.name, phone: lead.phone, email: lead.email, suburb: lead.suburb, service: lead.service, property_type: lead.property_type, timing: lead.timing, notes: lead.notes }); }}
                    onConvert={(target) => handleConvert(lead.id, target)}
                  />
                ))}
                {colLeads.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                    No leads
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Lead Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
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
              <Label>Property Type</Label>
              <Input value={form.property_type} onChange={(e) => setForm((f) => ({ ...f, property_type: e.target.value }))} placeholder="Residential" />
            </div>
            <div className="space-y-1.5">
              <Label>Timing</Label>
              <Input value={form.timing} onChange={(e) => setForm((f) => ({ ...f, timing: e.target.value }))} placeholder="ASAP" />
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v as LeadSource }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(SOURCE_LABELS) as [LeadSource, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Any additional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Saving..." : "Add Lead"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lead Dialog */}
      <Dialog open={!!editLead} onOpenChange={(o) => { if (!o) setEditLead(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
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
              <Label>Property Type</Label>
              <Input value={editForm.property_type ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, property_type: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Timing</Label>
              <Input value={editForm.timing ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, timing: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLead(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LeadCard({
  lead,
  converting,
  onMove,
  onDelete,
  onEdit,
  onConvert,
}: {
  lead: Lead;
  converting: boolean;
  onMove: (id: string, status: LeadStatus) => void;
  onDelete: () => void;
  onEdit: () => void;
  onConvert: (target: "customer" | "quote" | "work_order") => void;
}) {
  const NEXT_STATUS: Partial<Record<LeadStatus, LeadStatus>> = {
    new: "contacted",
    contacted: "quoted",
    quoted: "won",
  };
  const next = NEXT_STATUS[lead.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border bg-card shadow-sm p-3 space-y-2 hover:shadow-md transition-shadow"
    >
      {/* Name + menu */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{lead.name}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onConvert("customer")} disabled={converting || !!lead.customer_id}>
              Convert to customer{lead.customer_id ? " ✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onConvert("quote")} disabled={converting}>
              Convert to quote
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onConvert("work_order")} disabled={converting}>
              Convert to work order
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {COLUMNS.filter((c) => c.status !== lead.status).map((c) => (
              <DropdownMenuItem key={c.status} onClick={() => onMove(lead.id, c.status)}>
                Move to {c.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Details */}
      <div className="space-y-1">
        {lead.phone && (
          <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.phone}</span>
          </a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.email}</span>
          </a>
        )}
        {lead.suburb && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.suburb}</span>
          </div>
        )}
        {lead.service && (
          <div className="text-xs text-muted-foreground truncate">{lead.service}</div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDate(lead.created_at)}
        </div>
        {next && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2 gap-1"
            onClick={() => onMove(lead.id, next)}
          >
            {next.charAt(0).toUpperCase() + next.slice(1)}
            <ChevronRight className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Source badge */}
      {lead.source && lead.source !== "manual" && (
        <div className="pt-0">
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
            {SOURCE_LABELS[lead.source] ?? lead.source}
          </span>
        </div>
      )}
    </motion.div>
  );
}
