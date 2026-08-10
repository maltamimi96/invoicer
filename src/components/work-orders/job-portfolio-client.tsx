"use client";

/**
 * Job Portfolio — single-scroll case file for a work order.
 *
 * Replaces the old detail page. Sections (in order, with sticky TOC):
 *   Overview · Timeline · Photos · Time · Materials · Documents · Signatures · Financials
 *
 * Each section reads from its own `job_*` table (post-Phase-1 migration) and
 * mutates via the corresponding server action. Every mutation also writes to
 * `job_timeline_events` so the Timeline section is the source of truth for
 * "what happened on this job".
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Camera, Clock, Package, FileText, PenLine, Receipt, History,
  Play, Square, Plus, Trash2, ExternalLink, MapPin, User, Calendar,
  CheckCircle2, Loader2, Image as ImageIcon, Upload, Eye, EyeOff, X, RotateCcw,
  Share2, FileDown, Copy, Link2Off, Phone, Download, Maximize2, ChevronLeft, ChevronRight,
} from "@/components/ui/icons";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { canEdit, isOwner, canManageTeam, canCaptureJobData, type Role } from "@/lib/permissions";
import { BackButton } from "@/components/layout/back-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, ChevronDown, Pencil } from "@/components/ui/icons";
import { updateWorkOrder, updateWorkOrderStatus, deleteWorkOrder, submitWorkOrder } from "@/lib/actions/work-orders";
import { addJobPhoto, deleteJobPhoto, updateJobPhoto } from "@/lib/actions/job-photos";
import { startTimeEntry, stopTimeEntry, deleteTimeEntry } from "@/lib/actions/job-time";
import { addJobMaterial, deleteJobMaterial } from "@/lib/actions/job-materials";
import { addJobDocument, deleteJobDocument } from "@/lib/actions/job-documents";
import { addJobSignature, deleteJobSignature } from "@/lib/actions/job-signatures";
import { enableWorkOrderShareLink, disableWorkOrderShareLink, invoiceUnbilledForWorkOrder } from "@/lib/actions/work-orders";
import { addJobNote } from "@/lib/actions/job-timeline";
import { createClient } from "@/lib/supabase/client";
import type {
  Customer, MemberProfile, WorkOrderWithCustomer, WorkOrderStatus,
  JobTimelineEvent, JobPhoto, JobPhotoPhase, JobTimeEntry, JobMaterial,
  JobDocument, JobSignature,
} from "@/types/database";
import type { RelatedQuote, RelatedInvoice } from "@/lib/actions/work-orders";

// ── Types ────────────────────────────────────────────────────────────────────

interface SiteLite {
  id: string;
  label: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  gate_code: string | null;
  parking_notes: string | null;
}
interface ContactLite {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
}

interface JobPortfolioProps {
  workOrder: WorkOrderWithCustomer;
  customers: Customer[];
  userRole: Role;
  currentUserId: string;
  currentUserEmail: string;
  assignedWorkers: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'>[];
  /** All worker profiles in the business — used to populate the assignment picker. */
  availableWorkers: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'>[];
  timeline: JobTimelineEvent[];
  jobPhotos: JobPhoto[];
  timeEntries: JobTimeEntry[];
  materials: JobMaterial[];
  documents: JobDocument[];
  signatures: JobSignature[];
  financials: { quotes: RelatedQuote[]; invoices: RelatedInvoice[] };
  site: SiteLite | null;
  bookerContact: ContactLite | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_ORDER: WorkOrderStatus[] = ["draft", "assigned", "in_progress", "submitted", "reviewed", "completed"];
const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft: "Draft", assigned: "Assigned", in_progress: "In progress",
  submitted: "Submitted", reviewed: "Reviewed", completed: "Completed", cancelled: "Cancelled",
};
const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  submitted: "bg-purple-100 text-purple-700",
  reviewed: "bg-indigo-100 text-indigo-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const SECTIONS = [
  { id: "overview",   label: "Overview",   icon: FileText },
  { id: "timeline",   label: "Timeline",   icon: History },
  { id: "photos",     label: "Photos",     icon: Camera },
  { id: "time",       label: "Time",       icon: Clock },
  { id: "materials",  label: "Materials",  icon: Package },
  { id: "documents",  label: "Documents",  icon: FileText },
  { id: "signatures", label: "Signatures", icon: PenLine },
  { id: "financials", label: "Financials", icon: Receipt },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtDuration(seconds: number | null | undefined) {
  const s = seconds ?? 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtMoney(n: number | null | undefined) {
  return `$${(n ?? 0).toFixed(2)}`;
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ id, title, icon: Icon, children, action }: {
  id: string; title: string; icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        {action}
      </div>
      <Card><CardContent className="p-5">{children}</CardContent></Card>
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground italic">{children}</p>;
}

// ── Main client ──────────────────────────────────────────────────────────────

export function JobPortfolioClient(props: JobPortfolioProps) {
  const {
    workOrder, userRole, currentUserId, assignedWorkers, availableWorkers, timeline,
    jobPhotos: initialPhotos, timeEntries: initialTime, materials: initialMaterials,
    documents: initialDocs, signatures: initialSignatures, financials, site, bookerContact,
  } = props;

  const router = useRouter();
  const editable = canEdit(userRole);             // can change scope, status, etc.
  const canCapture = canCaptureJobData(userRole); // can upload from-site work (workers too)
  const deletable = canManageTeam(userRole);      // owners + admins
  const canAssign = canManageTeam(userRole);      // who can change job assignments

  // Local state mirrors so optimistic updates feel snappy
  const [photos, setPhotos] = useState<JobPhoto[]>(initialPhotos);
  const [timeEntries, setTimeEntries] = useState<JobTimeEntry[]>(initialTime);
  const [materials, setMaterials] = useState<JobMaterial[]>(initialMaterials);
  const [documents, setDocuments] = useState<JobDocument[]>(initialDocs);
  const [signatures, setSignatures] = useState<JobSignature[]>(initialSignatures);
  const [activeSection, setActiveSection] = useState("overview");

  // Sticky TOC scroll-spy
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: "-100px 0px -60% 0px" });
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="space-y-6">
      <PortfolioHeader
        workOrder={workOrder}
        site={site}
        bookerContact={bookerContact}
        assignedWorkers={assignedWorkers}
        availableWorkers={availableWorkers}
        canAssign={canAssign}
        userRole={userRole}
        currentUserId={currentUserId}
        editable={editable}
        deletable={deletable}
        onDelete={async () => {
          if (!confirm(`Delete ${workOrder.number}? This can't be undone.`)) return;
          try { await deleteWorkOrder(workOrder.id); router.push("/work-orders"); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
        }}
      />

      <StickyTOC active={activeSection} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr] gap-6">
        <div className="space-y-6">
          <OverviewSection workOrder={workOrder} editable={editable} />
          <TimelineSection events={timeline} />
          <PhotosSection
            workOrderId={workOrder.id}
            photos={photos}
            editable={canCapture}
            currentUserId={currentUserId}
            onAdd={(p) => setPhotos((prev) => [...prev, p])}
            onUpdate={(id, patch) => setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p))}
            onDelete={(id) => setPhotos((prev) => prev.filter((p) => p.id !== id))}
          />
          <TimeSection
            workOrderId={workOrder.id}
            entries={timeEntries}
            editable={canCapture}
            onAdd={(e) => setTimeEntries((prev) => [...prev, e])}
            onUpdate={(id, patch) => setTimeEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e))}
            onDelete={(id) => setTimeEntries((prev) => prev.filter((e) => e.id !== id))}
          />
          <MaterialsSection
            workOrderId={workOrder.id}
            materials={materials}
            editable={canCapture}
            onAdd={(m) => setMaterials((prev) => [...prev, m])}
            onDelete={(id) => setMaterials((prev) => prev.filter((m) => m.id !== id))}
          />
          <DocumentsSection
            workOrderId={workOrder.id}
            documents={documents}
            editable={canCapture}
            currentUserId={currentUserId}
            onAdd={(d) => setDocuments((prev) => [d, ...prev])}
            onDelete={(id) => setDocuments((prev) => prev.filter((d) => d.id !== id))}
          />
          <SignaturesSection
            workOrderId={workOrder.id}
            signatures={signatures}
            editable={canCapture}
            currentUserId={currentUserId}
            onAdd={(s) => setSignatures((prev) => [...prev, s])}
            onDelete={(id) => setSignatures((prev) => prev.filter((s) => s.id !== id))}
          />
          <FinancialsSection workOrder={workOrder} financials={financials} timeEntries={timeEntries} materials={materials} editable={editable} />
        </div>
      </div>
    </div>
  );
}

// ── Share control ────────────────────────────────────────────────────────────

function ShareControl({ workOrderId, initialToken }: { workOrderId: string; initialToken: string | null }) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shareUrl = token && typeof window !== "undefined" ? `${window.location.origin}/jobs/${token}` : "";

  const enable = async () => {
    setBusy(true);
    try { const { token: t } = await enableWorkOrderShareLink(workOrderId); setToken(t); setOpen(true); toast.success("Share link enabled"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const disable = async () => {
    if (!confirm("Revoke the share link? Anyone with the link will lose access.")) return;
    setBusy(true);
    try { await disableWorkOrderShareLink(workOrderId); setToken(null); setOpen(false); toast.success("Share link revoked"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Link copied"); }
    catch { toast.error("Copy failed"); }
  };

  if (!token) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={enable} disabled={busy}>
        <Share2 className="w-3.5 h-3.5" />Share
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen((v) => !v)}>
        <Share2 className="w-3.5 h-3.5" />Shared
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-80 rounded-md border bg-background shadow-lg p-3 space-y-2">
          <p className="text-xs font-semibold">Customer share link</p>
          <div className="flex gap-1">
            <Input readOnly value={shareUrl} className="text-xs h-8" onClick={(e) => (e.target as HTMLInputElement).select()} />
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={copy}><Copy className="w-3.5 h-3.5" /></Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Only customer-visible items (timeline, photos, documents marked visible) are shown.</p>
          <Button size="sm" variant="ghost" className="w-full text-destructive hover:text-destructive gap-1.5" onClick={disable} disabled={busy}>
            <Link2Off className="w-3.5 h-3.5" />Revoke link
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function PortfolioHeader({
  workOrder, site, bookerContact, assignedWorkers, availableWorkers, canAssign, editable, deletable, onDelete,
}: {
  workOrder: WorkOrderWithCustomer;
  site: SiteLite | null;
  bookerContact: ContactLite | null;
  assignedWorkers: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'>[];
  availableWorkers: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'>[];
  canAssign: boolean;
  userRole: Role;
  currentUserId: string;
  editable: boolean;
  deletable: boolean;
  onDelete: () => void;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // refresh() after an await runs OUTSIDE the transition, so the
  // spinner stopped while the server was still re-rendering. See
  // components/layout/use-mutation.tsx.
  const { refresh } = useTrackedRefresh();
  const status = (workOrder.status ?? "draft") as WorkOrderStatus;
  // Owners + admins can reschedule (same gate as delete/assign).
  const canReschedule = deletable;
  const addr = site
    ? [site.address, site.city, site.postcode].filter(Boolean).join(", ")
    : workOrder.property_address ?? "";

  const setStatus = (next: WorkOrderStatus) => startTransition(async () => {
    try { await updateWorkOrderStatus(workOrder.id, next); refresh(); toast.success(`Status → ${STATUS_LABELS[next]}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Status update failed"); }
  });

  return (
    <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <BackButton fallbackHref="/work-orders" />
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">{workOrder.number}</span>
            <Badge className={`${STATUS_COLORS[status]} border-0`}>{STATUS_LABELS[status]}</Badge>
          </div>
          <h1 className="text-2xl font-bold break-words">{workOrder.title}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <a href={`/api/pdf/work-order/${workOrder.id}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5"><FileDown className="w-3.5 h-3.5" />PDF</Button>
          </a>
          {editable && (
            <>
              <ShareControl workOrderId={workOrder.id} initialToken={workOrder.share_token} />
              <Select value={status} onValueChange={(v) => setStatus(v as WorkOrderStatus)} disabled={isPending}>
                <SelectTrigger className="w-[130px] sm:w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              {deletable && (
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={onDelete}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Status pipeline */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STATUS_ORDER.map((s, i) => {
          const idx = STATUS_ORDER.indexOf(status);
          const stepIdx = i;
          const reached = idx >= stepIdx;
          return (
            <div key={s} className="flex items-center gap-1 flex-shrink-0">
              <div className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${reached ? STATUS_COLORS[s] : "bg-muted text-muted-foreground"}`}>
                {STATUS_LABELS[s]}
              </div>
              {i < STATUS_ORDER.length - 1 && <div className={`h-px w-4 ${reached && idx > stepIdx ? "bg-foreground/30" : "bg-border"}`} />}
            </div>
          );
        })}
      </div>

      {/* Quick facts grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <FactCard icon={User} label="Customer" value={workOrder.customers?.name ?? "—"} href={workOrder.customer_id ? `/customers/${workOrder.customer_id}` : undefined} />
        {workOrder.customers?.phone ? (
          <a href={`tel:${workOrder.customers.phone.replace(/\s/g, "")}`} className="block">
            <FactCard icon={Phone} label="Phone" value={workOrder.customers.phone} />
          </a>
        ) : (
          <FactCard icon={Phone} label="Phone" value={<span className="text-muted-foreground">No phone</span>} />
        )}
        <FactCard icon={MapPin} label="Site" value={addr || "No address"} href={site ? `/sites/${site.id}` : undefined} />
        <FactCard
          icon={Calendar}
          label="Scheduled"
          value={workOrder.scheduled_date ? `${fmtDate(workOrder.scheduled_date)}${workOrder.start_time ? ` · ${workOrder.start_time}` : ""}` : "Unscheduled"}
          onClick={canReschedule ? () => setRescheduleOpen(true) : undefined}
        />
        <FactCard
          icon={User}
          label="Workers"
          value={assignedWorkers.length === 0 ? "Unassigned" : assignedWorkers.map((w) => w.name).join(", ")}
          onClick={canAssign ? () => setAssignOpen(true) : undefined}
        />
      </div>

      {(site?.gate_code || site?.parking_notes || bookerContact) && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {site?.gate_code && <span>🔑 Gate: {site.gate_code}</span>}
          {site?.parking_notes && <span>🚗 {site.parking_notes}</span>}
          {bookerContact && <span>📞 Booked by {bookerContact.name}{bookerContact.phone ? ` (${bookerContact.phone})` : ""}</span>}
        </div>
      )}

      <AssignWorkersDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        workOrderId={workOrder.id}
        availableWorkers={availableWorkers}
        initialSelected={assignedWorkers.map((w) => w.id)}
        onSaved={() => refresh()}
      />

      <RescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        workOrderId={workOrder.id}
        initialDate={workOrder.scheduled_date}
        initialStart={workOrder.start_time}
        initialEnd={workOrder.end_time}
        onSaved={() => refresh()}
      />
    </motion.div>
  );
}

// ── Reschedule dialog ────────────────────────────────────────────────────────

function RescheduleDialog({
  open, onOpenChange, workOrderId, initialDate, initialStart, initialEnd, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workOrderId: string;
  initialDate: string | null;
  initialStart: string | null;
  initialEnd: string | null;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(initialDate ?? "");
  const [start, setStart] = useState(initialStart ?? "");
  const [end, setEnd] = useState(initialEnd ?? "");
  const [saving, setSaving] = useState(false);

  // Reset when reopening with fresh values.
  useEffect(() => {
    if (open) {
      setDate(initialDate ?? "");
      setStart(initialStart ?? "");
      setEnd(initialEnd ?? "");
    }
  }, [open, initialDate, initialStart, initialEnd]);

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkOrder(workOrderId, {
        scheduled_date: date || null,
        start_time: start || null,
        end_time: end || null,
      });
      toast.success(date ? "Job rescheduled" : "Schedule cleared");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reschedule");
    } finally {
      setSaving(false);
    }
  };

  const clear = () => { setDate(""); setStart(""); setEnd(""); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule job</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start time</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">End time</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Changes are logged to the job timeline. Leave the date blank to mark the job unscheduled.
          </p>
        </div>
        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={clear} disabled={saving}>Clear</Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign workers dialog ────────────────────────────────────────────────────

function AssignWorkersDialog({
  open, onOpenChange, workOrderId, availableWorkers, initialSelected, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workOrderId: string;
  availableWorkers: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'>[];
  initialSelected: string[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [saving,   setSaving]   = useState(false);

  // Reset selected whenever the dialog re-opens with fresh data.
  useEffect(() => { if (open) setSelected(initialSelected); }, [open, initialSelected]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkOrder(workOrderId, { member_profile_ids: selected });
      toast.success(selected.length === 0 ? "Workers cleared" : `${selected.length} worker${selected.length > 1 ? "s" : ""} assigned`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign workers</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto -mx-6 px-2">
          {availableWorkers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              No workers yet. Add team members in <Link href="/team" className="text-primary underline">Team</Link>.
            </p>
          ) : (
            availableWorkers.map((w) => {
              const sel = selected.includes(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggle(w.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors text-left ${sel ? "bg-muted/60" : ""}`}
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {w.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium break-words">{w.name}</p>
                    <p className="text-xs text-muted-foreground break-words">{w.role_title ?? w.email ?? "Worker"}</p>
                  </div>
                  {sel && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
        <div className="flex justify-between items-center pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {selected.length === 0 ? "No workers selected" : `${selected.length} selected`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FactCard({ icon: Icon, label, value, href, onClick }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className={`flex items-start gap-2.5 p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors h-full ${onClick ? "cursor-pointer hover:border-primary/40" : ""}`}>
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <div className="text-sm font-medium break-words">{value}</div>
      </div>
      {onClick && <Pencil className="w-3 h-3 text-muted-foreground/60 ml-auto flex-shrink-0" />}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="text-left w-full">{inner}</button>;
  return inner;
}

// ── Sticky TOC ───────────────────────────────────────────────────────────────

function StickyTOC({ active }: { active: string }) {
  return (
    <div className="sticky top-0 z-20 -mx-6 px-6 bg-background/95 backdrop-blur border-b">
      <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-thin">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              active === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function OverviewSection({ workOrder, editable }: { workOrder: WorkOrderWithCustomer; editable: boolean }) {
  const [scope, setScope] = useState(workOrder.scope_of_work ?? "");
  const [savingScope, setSavingScope] = useState(false);

  const saveScope = async () => {
    setSavingScope(true);
    try { await updateWorkOrder(workOrder.id, { scope_of_work: scope }); toast.success("Scope saved"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setSavingScope(false); }
  };

  return (
    <Section id="overview" title="Overview" icon={FileText}>
      <div className="space-y-4">
        {workOrder.reported_issue && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Reported issue</p>
            <p className="text-sm whitespace-pre-wrap">{workOrder.reported_issue}</p>
          </div>
        )}
        {workOrder.description && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Instructions for worker</p>
            <p className="text-sm whitespace-pre-wrap">{workOrder.description}</p>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Scope of work</p>
            {editable && scope !== (workOrder.scope_of_work ?? "") && (
              <Button size="sm" variant="outline" onClick={saveScope} disabled={savingScope}>
                {savingScope ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
              </Button>
            )}
          </div>
          {editable ? (
            <Textarea rows={4} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="What's planned for this job…" />
          ) : (
            scope ? <p className="text-sm whitespace-pre-wrap">{scope}</p> : <EmptyHint>No scope defined</EmptyHint>
          )}
        </div>
        {workOrder.worker_notes && (
          <div className="bg-muted/40 rounded-md p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Worker notes</p>
            <p className="text-sm whitespace-pre-wrap">{workOrder.worker_notes}</p>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const TIMELINE_LABELS: Partial<Record<JobTimelineEvent['type'], string>> = {
  created: "Job created",
  status_change: "Status changed",
  assigned: "Workers assigned",
  unassigned: "Workers unassigned",
  scheduled: "Scheduled",
  rescheduled: "Schedule updated",
  arrived: "Arrived on site",
  departed: "Departed site",
  photo_added: "Photo added",
  note_added: "Note added",
  message_sent: "Message sent",
  message_received: "Message received",
  quote_sent: "Quote sent",
  quote_viewed: "Quote viewed",
  quote_accepted: "Quote accepted",
  quote_rejected: "Quote rejected",
  invoice_sent: "Invoice sent",
  invoice_viewed: "Invoice viewed",
  invoice_paid: "Invoice paid",
  time_started: "Timer started",
  time_ended: "Time logged",
  material_added: "Material added",
  signature_captured: "Signature captured",
  form_completed: "Form completed",
  scope_change: "Scope updated",
  document_uploaded: "Document uploaded",
  review_requested: "Review requested",
  review_received: "Review received",
};

function describeEvent(e: JobTimelineEvent): string {
  const base = TIMELINE_LABELS[e.type] ?? e.type;
  if (e.type === "status_change" && e.payload?.to) return `Status → ${STATUS_LABELS[e.payload.to as WorkOrderStatus] ?? e.payload.to}`;
  if (e.type === "photo_added" && e.payload?.phase) return `Photo added (${e.payload.phase})`;
  if (e.type === "material_added" && e.payload?.name) return `Added ${e.payload.qty ?? ""} × ${e.payload.name}`;
  if (e.type === "time_ended" && e.payload?.duration_seconds) return `Time logged — ${fmtDuration(e.payload.duration_seconds as number)}`;
  if (e.type === "note_added" && e.payload?.content) return `Note: ${String(e.payload.content).slice(0, 80)}`;
  return base;
}

function TimelineSection({ events }: { events: JobTimelineEvent[] }) {
  // Show newest first
  const sorted = useMemo(() => [...events].sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at)), [events]);

  return (
    <Section id="timeline" title="Timeline" icon={History}>
      {sorted.length === 0 ? (
        <EmptyHint>No events yet — actions on this job will show up here.</EmptyHint>
      ) : (
        <div className="space-y-3">
          {sorted.slice(0, 50).map((e) => (
            <div key={e.id} className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{describeEvent(e)}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(e.occurred_at)}
                  {e.actor_label ? ` · ${e.actor_label}` : ""}
                  {e.actor_type === "system" ? " · system" : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Photos ───────────────────────────────────────────────────────────────────

const PHASE_TABS: { key: JobPhotoPhase; label: string }[] = [
  { key: "before", label: "Before" },
  { key: "during", label: "During" },
  { key: "after", label: "After" },
  { key: "reference", label: "Reference" },
];

type PhotoFilter = JobPhotoPhase | "all";

// ── Photo download helpers ─────────────────────────────────────────────────
function extFromUrl(url: string, fallback = "jpg"): string {
  const m = url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : fallback;
}
function triggerBlobDownload(blob: Blob, filename: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(u);
}
async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return res.blob();
}
/** Zip a set of photos client-side (STORE — images are already compressed). */
async function downloadPhotosAsZip(
  photos: JobPhoto[], zipName: string, onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let done = 0, ok = 0;
  const CONCURRENCY = 6;
  const queue = [...photos.entries()];
  async function worker() {
    for (;;) {
      const next = queue.shift();
      if (!next) break;
      const [i, p] = next;
      try {
        const blob = await fetchAsBlob(p.url);
        const name = `${p.phase || "photo"}-${String(i + 1).padStart(2, "0")}.${extFromUrl(p.url)}`;
        zip.file(name, blob);
        ok++;
      } catch { /* skip unreachable image */ }
      done++; onProgress?.(done, photos.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, photos.length) }, worker));
  if (ok === 0) throw new Error("None of the images could be downloaded");
  const out = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(out, zipName);
  return ok;
}

function PhotosSection({
  workOrderId, photos, editable, currentUserId, onAdd, onUpdate, onDelete,
}: {
  workOrderId: string;
  photos: JobPhoto[];
  editable: boolean;
  currentUserId: string;
  onAdd: (p: JobPhoto) => void;
  onUpdate: (id: string, patch: Partial<JobPhoto>) => void;
  onDelete: (id: string) => void;
}) {
  // Default to the first phase that actually has photos — otherwise worker
  // uploads (which default to "during") look invisible on an admin's first
  // visit because "before" is empty.
  const initialPhase = useMemo<PhotoFilter>(() => {
    const populated = PHASE_TABS.find((t) => photos.some((p) => p.phase === t.key));
    return populated?.key ?? "before";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activePhase, setActivePhase] = useState<PhotoFilter>(initialPhase);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zip, setZip] = useState<{ done: number; total: number } | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadPhase: JobPhotoPhase = activePhase === "all" ? "during" : activePhase;
  const filtered = useMemo(
    () => (activePhase === "all" ? photos : photos.filter((p) => p.phase === activePhase)),
    [photos, activePhase],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    PHASE_TABS.forEach((t) => { c[t.key] = photos.filter((p) => p.phase === t.key).length; });
    return c;
  }, [photos]);

  const selectedPhotos = useMemo(() => photos.filter((p) => selected.has(p.id)), [photos, selected]);
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const selectAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((p) => next.delete(p.id));
      else filtered.forEach((p) => next.add(p.id));
      return next;
    });

  const runZip = async (list: JobPhoto[], label: string) => {
    if (list.length === 0) return;
    if (list.length === 1) {
      // Single image → download directly, no zip.
      try {
        const blob = await fetchAsBlob(list[0].url);
        triggerBlobDownload(blob, `${list[0].phase || "photo"}.${extFromUrl(list[0].url)}`);
      } catch { toast.error("Couldn't download image"); }
      return;
    }
    setZip({ done: 0, total: list.length });
    try {
      const n = await downloadPhotosAsZip(list, `${label}.zip`, (done, total) => setZip({ done, total }));
      toast.success(`Downloaded ${n} photo${n > 1 ? "s" : ""}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Download failed"); }
    finally { setZip(null); }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${currentUserId}/${workOrderId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("work-order-photos").upload(path, file);
        if (up.error) throw up.error;
        const { data } = supabase.storage.from("work-order-photos").getPublicUrl(path);
        const newPhoto = await addJobPhoto({
          work_order_id: workOrderId,
          url: data.publicUrl,
          phase: uploadPhase,
        });
        onAdd(newPhoto);
      }
      toast.success("Uploaded");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const busy = zip !== null;

  return (
    <Section
      id="photos"
      title="Photos"
      icon={Camera}
      action={
        <div className="flex items-center gap-2">
          {photos.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => runZip(photos, `${workOrderId}-all-photos`)} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
              Download all ({photos.length})
            </Button>
          )}
          {editable && (
            <>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                Upload{activePhase === "all" ? "" : ` to ${activePhase}`}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="flex gap-1 mb-4 border-b overflow-x-auto">
        <button
          onClick={() => setActivePhase("all")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activePhase === "all" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All {photos.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({photos.length})</span>}
        </button>
        {PHASE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActivePhase(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activePhase === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} {counts[t.key] > 0 && <span className="ml-1 text-xs text-muted-foreground">({counts[t.key]})</span>}
          </button>
        ))}
      </div>

      {/* Selection toolbar */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={selectAllVisible}>
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${allVisibleSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                {allVisibleSelected && <Check className="w-3 h-3" />}
              </div>
              {allVisibleSelected ? "Clear" : "Select all"}
            </Button>
            {selected.size > 0 && (
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            )}
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())} disabled={busy}>Cancel</Button>
              <Button size="sm" className="h-8" onClick={() => runZip(selectedPhotos, `${workOrderId}-photos`)} disabled={busy}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                Download {selected.size}
              </Button>
            </div>
          )}
        </div>
      )}

      {busy && zip && (
        <div className="mb-3">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((zip.done / zip.total) * 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Preparing zip… {zip.done}/{zip.total}</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-8 text-center">
          <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No {activePhase === "all" ? "" : activePhase} photos yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((p, i) => (
            <PhotoCard
              key={p.id}
              photo={p}
              editable={editable}
              selected={selected.has(p.id)}
              onToggleSelect={() => toggleSelect(p.id)}
              onExpand={() => setLightbox(i)}
              onPhaseChange={(phase) => { onUpdate(p.id, { phase }); updateJobPhoto(p.id, { phase }).catch(() => toast.error("Failed to re-tag")); }}
              onDelete={() => {
                if (!confirm("Delete this photo?")) return;
                onDelete(p.id);
                setSelected((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
                deleteJobPhoto(p.id).catch(() => toast.error("Delete failed"));
              }}
            />
          ))}
        </div>
      )}

      {lightbox !== null && filtered[lightbox] && (
        <PhotoLightbox
          photos={filtered}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          onDownload={(p) => runZip([p], "photo")}
        />
      )}
    </Section>
  );
}

function PhotoCard({ photo, editable, selected, onToggleSelect, onExpand, onPhaseChange, onDelete }: {
  photo: JobPhoto; editable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onExpand: () => void;
  onPhaseChange: (phase: JobPhotoPhase) => void; onDelete: () => void;
}) {
  return (
    <div className={`group relative rounded-lg overflow-hidden border bg-muted aspect-square ${selected ? "ring-2 ring-primary ring-offset-1" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.caption ?? ""}
        className="w-full h-full object-cover cursor-zoom-in"
        onClick={onExpand}
      />

      {/* Selection checkbox — always visible top-left */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        className="absolute top-2 left-2 z-10"
        aria-label={selected ? "Deselect photo" : "Select photo"}
      >
        <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shadow-sm transition-colors ${
          selected ? "bg-primary border-primary text-primary-foreground" : "bg-white/85 border-white/90 text-transparent hover:bg-white"
        }`}>
          <Check className="w-4 h-4" />
        </span>
      </button>

      {/* Expand button — top-right on hover */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onExpand(); }}
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-md bg-black/45 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Expand photo"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>

      {editable && (
        <div className="absolute inset-x-0 bottom-0 p-2 flex items-end justify-between gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/55 to-transparent pt-8 pointer-events-none">
          <div className="pointer-events-auto w-[60%]" onClick={(e) => e.stopPropagation()}>
            <Select value={photo.phase} onValueChange={(v) => onPhaseChange(v as JobPhotoPhase)}>
              <SelectTrigger className="h-7 text-xs bg-white/90"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PHASE_TABS.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="pointer-events-auto w-7 h-7 rounded-md bg-destructive text-destructive-foreground flex items-center justify-center shrink-0"
            aria-label="Delete photo"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function PhotoLightbox({ photos, index, onIndex, onClose, onDownload }: {
  photos: JobPhoto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDownload: (p: JobPhoto) => void;
}) {
  const photo = photos[index];
  const go = (delta: number) => {
    const n = index + delta;
    if (n >= 0 && n < photos.length) onIndex(n);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos.length]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 text-white/90" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm">{index + 1} / {photos.length}{photo.phase ? ` · ${photo.phase}` : ""}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" className="h-8 gap-1.5" onClick={() => onDownload(photo)}>
            <Download className="w-3.5 h-3.5" /> Download
          </Button>
          <button onClick={onClose} className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center px-2 pb-4 min-h-0" onClick={(e) => e.stopPropagation()}>
        {index > 0 && (
          <button onClick={() => go(-1)} className="absolute left-2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" aria-label="Previous">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img loading="lazy" decoding="async" src={photo.url} alt={photo.caption ?? ""} className="max-h-full max-w-full object-contain rounded" />
        {index < photos.length - 1 && (
          <button onClick={() => go(1)} className="absolute right-2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" aria-label="Next">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
      {photo.caption && (
        <p className="text-center text-white/70 text-sm pb-4 px-4" onClick={(e) => e.stopPropagation()}>{photo.caption}</p>
      )}
    </div>
  );
}

// ── Time ─────────────────────────────────────────────────────────────────────

function TimeSection({
  workOrderId, entries, editable, onAdd, onUpdate, onDelete,
}: {
  workOrderId: string;
  entries: JobTimeEntry[];
  editable: boolean;
  onAdd: (e: JobTimeEntry) => void;
  onUpdate: (id: string, patch: Partial<JobTimeEntry>) => void;
  onDelete: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const open = entries.find((e) => !e.ended_at);
  const totalSec = entries.reduce((s, e) => s + (e.duration_seconds ?? 0), 0);

  const start = async (type: "work" | "travel" | "break") => {
    setBusy(true);
    try { const e = await startTimeEntry({ work_order_id: workOrderId, type }); onAdd(e); toast.success(`${type} timer started`); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    if (!open) return;
    setBusy(true);
    try { const e = await stopTimeEntry(open.id); onUpdate(open.id, e); toast.success("Timer stopped"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Section
      id="time"
      title="Time"
      icon={Clock}
      action={editable && (
        open ? (
          <Button size="sm" variant="destructive" onClick={stop} disabled={busy}>
            <Square className="w-3.5 h-3.5 mr-1.5" /> Stop {open.type}
          </Button>
        ) : (
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => start("work")} disabled={busy}><Play className="w-3.5 h-3.5 mr-1" /> Work</Button>
            <Button size="sm" variant="outline" onClick={() => start("travel")} disabled={busy}>Travel</Button>
            <Button size="sm" variant="outline" onClick={() => start("break")} disabled={busy}>Break</Button>
          </div>
        )
      )}
    >
      <div className="mb-3 text-sm">
        <span className="text-muted-foreground">Total: </span>
        <span className="font-semibold">{fmtDuration(totalSec)}</span>
        {open && <span className="ml-3 text-amber-600 font-medium">● Live: {open.type}</span>}
      </div>
      {entries.length === 0 ? (
        <EmptyHint>No time logged yet.</EmptyHint>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase">{e.type}</Badge>
                <span className="text-muted-foreground">{fmtDateTime(e.started_at)}</span>
                {e.ended_at ? <span>→ {fmtDateTime(e.ended_at)}</span> : <span className="text-amber-600">running…</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{e.ended_at ? fmtDuration(e.duration_seconds) : "—"}</span>
                {editable && (
                  <button className="text-muted-foreground hover:text-destructive" onClick={async () => {
                    if (!confirm("Delete this entry?")) return;
                    onDelete(e.id);
                    try { await deleteTimeEntry(e.id); } catch { toast.error("Delete failed"); }
                  }}><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Materials ────────────────────────────────────────────────────────────────

function MaterialsSection({
  workOrderId, materials, editable, onAdd, onDelete,
}: {
  workOrderId: string;
  materials: JobMaterial[];
  editable: boolean;
  onAdd: (m: JobMaterial) => void;
  onDelete: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("ea");
  const [unitPrice, setUnitPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const total = materials.reduce((s, m) => s + (m.qty * (m.unit_price ?? 0)), 0);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const m = await addJobMaterial({
        work_order_id: workOrderId,
        name: name.trim(),
        qty: parseFloat(qty) || 1,
        unit: unit || null,
        unit_price: unitPrice ? parseFloat(unitPrice) : null,
      });
      onAdd(m);
      setName(""); setQty("1"); setUnit("ea"); setUnitPrice("");
      setShowForm(false);
      toast.success("Material added");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Section
      id="materials"
      title="Materials"
      icon={Package}
      action={editable && !showForm && <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>}
    >
      {showForm && (
        <div className="border rounded-lg p-3 mb-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <Input className="sm:col-span-5" placeholder="Material name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input className="sm:col-span-2" type="number" step="0.01" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
            <Input className="sm:col-span-2" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
            <Input className="sm:col-span-3" type="number" step="0.01" placeholder="Unit price" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={busy || !name.trim()}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}</Button>
          </div>
        </div>
      )}
      {materials.length === 0 ? (
        <EmptyHint>No materials logged.</EmptyHint>
      ) : (
        <div className="space-y-1.5">
          {materials.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground ml-2">{m.qty} {m.unit ?? ""}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">{fmtMoney(m.qty * (m.unit_price ?? 0))}</span>
                {editable && (
                  <button className="text-muted-foreground hover:text-destructive" onClick={async () => {
                    if (!confirm("Remove?")) return;
                    onDelete(m.id);
                    try { await deleteJobMaterial(m.id); } catch { toast.error("Delete failed"); }
                  }}><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2 text-sm font-semibold">
            Total: {fmtMoney(total)}
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Documents ────────────────────────────────────────────────────────────────

const DOC_CATEGORIES: JobDocument['category'][] = ["permit", "warranty", "certificate", "insurance", "manual", "contract", "other"];

function DocumentsSection({
  workOrderId, documents, editable, currentUserId, onAdd, onDelete,
}: {
  workOrderId: string;
  documents: JobDocument[];
  editable: boolean;
  currentUserId: string;
  onAdd: (d: JobDocument) => void;
  onDelete: (id: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<JobDocument['category']>("other");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${currentUserId}/${workOrderId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("work-order-photos").upload(path, file);
        if (up.error) throw up.error;
        const { data } = supabase.storage.from("work-order-photos").getPublicUrl(path);
        const d = await addJobDocument({
          work_order_id: workOrderId,
          name: file.name,
          url: data.publicUrl,
          mime_type: file.type || null,
          size_bytes: file.size,
          category,
        });
        onAdd(d);
      }
      toast.success("Uploaded");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <Section
      id="documents"
      title="Documents"
      icon={FileText}
      action={editable && (
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={(v) => setCategory(v as JobDocument['category'])}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{DOC_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Upload className="w-3.5 h-3.5 mr-1.5" /> Upload</>}
          </Button>
        </div>
      )}
    >
      {documents.length === 0 ? (
        <EmptyHint>No documents attached.</EmptyHint>
      ) : (
        <div className="space-y-1.5">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline break-words">{d.name}</a>
                <Badge variant="outline" className="text-[10px]">{d.category}</Badge>
                {d.customer_visible ? <Eye className="w-3 h-3 text-muted-foreground" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
              </div>
              {editable && (
                <button className="text-muted-foreground hover:text-destructive" onClick={async () => {
                  if (!confirm("Delete?")) return;
                  onDelete(d.id);
                  try { await deleteJobDocument(d.id); } catch { toast.error("Delete failed"); }
                }}><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Signatures ───────────────────────────────────────────────────────────────

const SIG_PURPOSES: { key: "quote" | "completion" | "change_order" | "safety" | "other"; label: string }[] = [
  { key: "quote", label: "Quote acceptance" },
  { key: "completion", label: "Job completion" },
  { key: "change_order", label: "Change order" },
  { key: "safety", label: "Safety / SWMS" },
  { key: "other", label: "Other" },
];

function SignaturesSection({
  workOrderId, signatures, editable, currentUserId, onAdd, onDelete,
}: {
  workOrderId: string;
  signatures: JobSignature[];
  editable: boolean;
  currentUserId: string;
  onAdd: (s: JobSignature) => void;
  onDelete: (id: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);

  return (
    <Section
      id="signatures"
      title="Signatures"
      icon={PenLine}
      action={editable && !capturing && (
        <Button size="sm" onClick={() => setCapturing(true)}>
          <PenLine className="w-3.5 h-3.5 mr-1.5" /> Capture signature
        </Button>
      )}
    >
      {capturing && (
        <SignatureCapture
          workOrderId={workOrderId}
          currentUserId={currentUserId}
          onCancel={() => setCapturing(false)}
          onSaved={(s) => { onAdd(s); setCapturing(false); }}
        />
      )}

      {signatures.length === 0 && !capturing ? (
        <EmptyHint>No signatures captured yet.</EmptyHint>
      ) : (
        <div className="space-y-2 mt-3">
          {signatures.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                <a href={s.signature_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" decoding="async" src={s.signature_url} alt="signature" className="h-12 w-24 object-contain bg-white border rounded" />
                </a>
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{s.signed_by_name}{s.signed_by_role ? ` (${s.signed_by_role})` : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    {SIG_PURPOSES.find((p) => p.key === s.purpose)?.label ?? s.purpose} · {fmtDateTime(s.signed_at)}
                  </p>
                </div>
              </div>
              {editable && (
                <button
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={async () => {
                    if (!confirm("Delete this signature?")) return;
                    try { await deleteJobSignature(s.id); onDelete(s.id); } catch { toast.error("Delete failed"); }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function SignatureCapture({
  workOrderId, currentUserId, onSaved, onCancel,
}: {
  workOrderId: string;
  currentUserId: string;
  onSaved: (s: JobSignature) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [purpose, setPurpose] = useState<"quote" | "completion" | "change_order" | "safety" | "other">("completion");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty.current = true;
  };

  const onUp = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    dirty.current = false;
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Signed-by name is required"); return; }
    if (!dirty.current) { toast.error("Please draw a signature"); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Canvas export failed")), "image/png");
      });
      const supabase = createClient();
      const path = `${currentUserId}/${workOrderId}/${crypto.randomUUID()}.png`;
      const up = await supabase.storage.from("work-order-signatures").upload(path, blob, { contentType: "image/png" });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from("work-order-signatures").getPublicUrl(path);
      const saved = await addJobSignature({
        work_order_id: workOrderId,
        signed_by_name: name.trim(),
        signed_by_role: role.trim() || null,
        signature_url: data.publicUrl,
        purpose,
      });
      toast.success("Signature captured");
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Signed by *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div>
          <Label className="text-xs">Role</Label>
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Property manager" />
        </div>
        <div>
          <Label className="text-xs">Purpose</Label>
          <Select value={purpose} onValueChange={(v) => setPurpose(v as typeof purpose)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SIG_PURPOSES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded border bg-white touch-none">
        <canvas
          ref={canvasRef}
          className="block w-full h-40 cursor-crosshair"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onPointerCancel={onUp}
        />
      </div>

      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={clear}>
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Clear
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1.5" />Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
            Save signature
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Financials ───────────────────────────────────────────────────────────────

function FinancialsSection({ workOrder, financials, timeEntries, materials, editable }: {
  workOrder: WorkOrderWithCustomer;
  financials: { quotes: RelatedQuote[]; invoices: RelatedInvoice[] };
  timeEntries: JobTimeEntry[];
  materials: JobMaterial[];
  editable: boolean;
}) {
  const router = useRouter();
  const newQuoteHref = workOrder.customer_id ? `/quotes/new?customer=${workOrder.customer_id}&work_order=${workOrder.id}` : `/quotes/new?work_order=${workOrder.id}`;
  const newInvoiceHref = workOrder.customer_id ? `/invoices/new?customer=${workOrder.customer_id}&work_order=${workOrder.id}` : `/invoices/new?work_order=${workOrder.id}`;

  const unbilledTime = timeEntries.filter((e) => !e.invoice_id);
  const unbilledMaterials = materials.filter((m) => !m.invoice_id && m.billable);
  const unbilledHours = unbilledTime.reduce((s, e) => s + ((e.duration_seconds ?? 0) / 3600), 0);
  const hasUnbilled = unbilledTime.length > 0 || unbilledMaterials.length > 0;

  const [showForm, setShowForm] = useState(false);
  const [hourlyRate, setHourlyRate] = useState("");
  const [includeTravel, setIncludeTravel] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onInvoice() {
    setBusy(true);
    try {
      const rate = parseFloat(hourlyRate) || 0;
      const res = await invoiceUnbilledForWorkOrder(workOrder.id, { hourly_rate: rate, include_travel: includeTravel });
      toast.success(`Invoice ${res.invoice_number} created — $${res.subtotal.toFixed(2)}`);
      setShowForm(false);
      router.push(`/invoices/${res.invoice_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section id="financials" title="Financials" icon={Receipt}>
      <div className="space-y-4">
        {editable && hasUnbilled && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">Unbilled work ready to invoice</div>
                <div className="text-xs text-muted-foreground">
                  {unbilledHours > 0 && `${unbilledHours.toFixed(2)} hr`}
                  {unbilledHours > 0 && unbilledMaterials.length > 0 && " · "}
                  {unbilledMaterials.length > 0 && `${unbilledMaterials.length} material${unbilledMaterials.length === 1 ? "" : "s"}`}
                </div>
              </div>
              {!showForm && (
                <Button size="sm" onClick={() => setShowForm(true)}>
                  <Receipt className="w-3.5 h-3.5 mr-1" /> Invoice unbilled
                </Button>
              )}
            </div>
            {showForm && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Hourly rate</Label>
                    <Input type="number" step="0.01" min="0" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="0.00" />
                  </div>
                  <label className="flex items-end gap-2 text-sm pb-2">
                    <input type="checkbox" checked={includeTravel} onChange={(e) => setIncludeTravel(e.target.checked)} />
                    Bill travel time
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={onInvoice} disabled={busy}>{busy ? "Creating…" : "Create draft invoice"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} disabled={busy}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Quotes</h3>
            <Link href={newQuoteHref}><Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> New quote</Button></Link>
          </div>
          {financials.quotes.length === 0 ? (
            <EmptyHint>No quotes linked.</EmptyHint>
          ) : (
            <div className="space-y-1.5">
              {financials.quotes.map((q) => (
                <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{q.number}</span>
                    <Badge variant="outline" className="text-[10px]">{q.status}</Badge>
                  </div>
                  <span className="font-medium">{fmtMoney(q.total)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Invoices</h3>
            <Link href={newInvoiceHref}><Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> New invoice</Button></Link>
          </div>
          {financials.invoices.length === 0 ? (
            <EmptyHint>No invoices linked.</EmptyHint>
          ) : (
            <div className="space-y-1.5">
              {financials.invoices.map((i) => (
                <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{i.number}</span>
                    <Badge variant="outline" className="text-[10px]">{i.status}</Badge>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">{fmtMoney(i.total)}</span>
                    {i.amount_paid > 0 && <span className="text-xs text-muted-foreground ml-2">({fmtMoney(i.amount_paid)} paid)</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
