"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2, User, Clock, MapPin, Calendar, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { createScheduledJob, updateScheduledJob, deleteScheduledJob } from "@/lib/actions/schedule";
import type { ScheduledJob, MemberProfile, Customer, WorkOrderStatus } from "@/types/database";

const AVATAR_COLORS = [
  "bg-blue-500","bg-violet-500","bg-pink-500","bg-orange-500",
  "bg-teal-500","bg-cyan-500","bg-rose-500","bg-amber-500",
];
function avatarColor(id: string): string {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

const STATUS_OPTIONS: { value: WorkOrderStatus; label: string }[] = [
  { value: "draft",       label: "Scheduled" },
  { value: "assigned",    label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted",   label: "Submitted" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
];

interface Props {
  mode: "create" | "edit";
  job?: ScheduledJob;
  defaultDate?: string;
  profiles: MemberProfile[];
  customers: Customer[];
  onClose: () => void;
  onSaved: () => void;
}

export function JobModal({ mode, job, defaultDate, profiles, customers, onClose, onSaved }: Props) {
  const [title,           setTitle]           = useState(job?.title ?? "");
  const [date,            setDate]            = useState(job?.scheduled_date ?? defaultDate ?? new Date().toISOString().split("T")[0]);
  const [startTime,       setStartTime]       = useState(job?.start_time?.slice(0, 5) ?? "");
  const [endTime,         setEndTime]         = useState(job?.end_time?.slice(0, 5) ?? "");
  const [customerId,      setCustomerId]      = useState<string>(job?.customer_id ?? "");
  const [address,         setAddress]         = useState(job?.property_address ?? "");
  const [description,     setDescription]     = useState(job?.description ?? "");
  const [scopeOfWork,     setScopeOfWork]     = useState(job?.scope_of_work ?? "");
  const [status,          setStatus]          = useState<WorkOrderStatus>(job?.status ?? "draft");
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>(
    job?.work_order_assignments?.map((a) => a.member_profile_id) ?? []
  );
  const [saving,          setSaving]          = useState(false);
  const [showDelete,      setShowDelete]      = useState(false);
  const [workerOpen,      setWorkerOpen]      = useState(false);

  // Auto-fill address when customer selected
  const handleCustomerChange = (id: string) => {
    setCustomerId(id);
    if (!address) {
      const cust = customers.find((c) => c.id === id);
      if (cust?.address) setAddress([cust.address, cust.city].filter(Boolean).join(", "));
    }
  };

  const toggleWorker = (id: string) => {
    setSelectedWorkers((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!date)          { toast.error("Date is required"); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        scheduled_date: date,
        start_time: startTime || null,
        end_time: endTime || null,
        customer_id: customerId || null,
        property_address: address || null,
        description: description || null,
        scope_of_work: scopeOfWork || null,
        member_profile_ids: selectedWorkers,
      };
      if (mode === "create") {
        await createScheduledJob(payload);
        toast.success("Job scheduled");
      } else {
        await updateScheduledJob(job!.id, { ...payload, status });
        toast.success("Job updated");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteScheduledJob(job!.id);
      toast.success("Job deleted");
      onSaved();
    } catch { toast.error("Failed to delete"); }
    setSaving(false);
  };

  const selectedProfiles = profiles.filter((p) => selectedWorkers.includes(p.id));

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Schedule Job" : "Edit Job"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Title */}
            <div className="space-y-1.5">
              <Label>Job Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Gutter cleaning — Smith residence" />
            </div>

            {/* Date + Times */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Date *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Start</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            {/* Status (edit only) */}
            {mode === "edit" && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as WorkOrderStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Customer */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> Customer</Label>
              <Select value={customerId} onValueChange={handleCustomerChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No customer</SelectItem>
                  {customers.filter((c) => !c.archived).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.company ? ` — ${c.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Property Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Sydney NSW" />
            </div>

            {/* Workers */}
            <div className="space-y-1.5">
              <Label>Assign Workers</Label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setWorkerOpen(!workerOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-background hover:bg-muted/50 transition-colors"
                >
                  <span className="text-muted-foreground">
                    {selectedProfiles.length === 0
                      ? "Select workers..."
                      : `${selectedProfiles.length} worker${selectedProfiles.length > 1 ? "s" : ""} selected`}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {workerOpen && (
                  <div className="absolute z-50 top-full mt-1 w-full border rounded-md bg-popover shadow-md overflow-hidden">
                    {profiles.filter((p) => p.is_active).map((p) => {
                      const selected = selectedWorkers.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleWorker(p.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors text-left"
                        >
                          <div className={`h-7 w-7 rounded-full ${avatarColor(p.id)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                            {initials(p.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            {p.role_title && <p className="text-xs text-muted-foreground truncate">{p.role_title}</p>}
                          </div>
                          {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                    {profiles.filter((p) => p.is_active).length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No active workers</p>
                    )}
                  </div>
                )}
              </div>

              {/* Selected worker chips */}
              {selectedProfiles.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedProfiles.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 bg-muted rounded-full pl-1 pr-2.5 py-0.5">
                      <div className={`h-5 w-5 rounded-full ${avatarColor(p.id)} flex items-center justify-center text-white text-[9px] font-bold`}>
                        {initials(p.name)}
                      </div>
                      <span className="text-xs font-medium">{p.name}</span>
                      <button
                        type="button"
                        onClick={() => toggleWorker(p.id)}
                        className="ml-0.5 text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description / Scope</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Job details, access notes..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {mode === "edit" && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive mr-auto"
                onClick={() => setShowDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : mode === "create" ? "Schedule Job" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the work order and all assignments.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
