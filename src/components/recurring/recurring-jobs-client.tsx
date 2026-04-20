"use client";

import { useState } from "react";
import { Plus, Repeat, Pause, Play, Trash2, Edit2, MapPin, User as UserIcon, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  createRecurringJob, updateRecurringJob, deleteRecurringJob, setRecurringJobActive,
  type RecurringJobInput,
} from "@/lib/actions/recurring-jobs";
import type { RecurringJob, RecurringJobCadence, Customer, MemberProfile } from "@/types/database";

const CADENCE_LABEL: Record<RecurringJobCadence, string> = {
  weekly: "Every week",
  fortnightly: "Every 2 weeks",
  monthly: "Every month",
  quarterly: "Every 3 months",
};

const WEEKDAY_LABEL = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function emptyForm(): RecurringJobInput {
  const today = new Date().toISOString().split("T")[0];
  return {
    name: "",
    title: "",
    description: "",
    customer_id: null,
    site_id: null,
    property_address: "",
    reported_issue: "",
    member_profile_ids: [],
    cadence: "monthly",
    preferred_weekday: null,
    preferred_day_of_month: 1,
    preferred_start_time: "",
    preferred_duration_minutes: null,
    generate_days_ahead: 14,
    next_occurrence_at: today,
    ends_on: null,
    active: true,
  };
}

interface Props {
  initialSchedules: RecurringJob[];
  customers: Customer[];
  profiles: MemberProfile[];
}

export function RecurringJobsClient({ initialSchedules, customers, profiles }: Props) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringJob | null>(null);
  const [form, setForm] = useState<RecurringJobInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(s: RecurringJob) {
    setEditing(s);
    setForm({
      name: s.name,
      title: s.title,
      description: s.description ?? "",
      customer_id: s.customer_id,
      site_id: s.site_id,
      property_address: s.property_address ?? "",
      reported_issue: s.reported_issue ?? "",
      member_profile_ids: s.member_profile_ids,
      cadence: s.cadence,
      preferred_weekday: s.preferred_weekday,
      preferred_day_of_month: s.preferred_day_of_month,
      preferred_start_time: s.preferred_start_time ?? "",
      preferred_duration_minutes: s.preferred_duration_minutes,
      generate_days_ahead: s.generate_days_ahead,
      next_occurrence_at: s.next_occurrence_at,
      ends_on: s.ends_on,
      active: s.active,
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.title) {
      toast.error("Name and job title are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateRecurringJob(editing.id, form);
        setSchedules((prev) => prev.map((s) => (s.id === editing.id ? { ...s, ...form } as RecurringJob : s)));
        toast.success("Schedule updated");
      } else {
        const created = await createRecurringJob(form);
        setSchedules((prev) => [created, ...prev]);
        toast.success("Recurring schedule created");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: RecurringJob) {
    try {
      await setRecurringJobActive(s.id, !s.active);
      setSchedules((prev) => prev.map((r) => (r.id === s.id ? { ...r, active: !r.active } : r)));
      toast.success(s.active ? "Paused" : "Resumed");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteRecurringJob(deleteId);
      setSchedules((prev) => prev.filter((s) => s.id !== deleteId));
      toast.success("Deleted");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    setDeleteId(null);
  }

  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.name ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Repeat className="h-6 w-6" /> Recurring jobs</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{schedules.length} schedule{schedules.length === 1 ? "" : "s"} · cron generates jobs nightly</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> New schedule</Button>
      </div>

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No recurring schedules yet. Set up your first one for cleaning rotations, monthly maintenance, etc.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {schedules.map((s) => (
            <Card key={s.id} className={!s.active ? "opacity-60" : ""}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{s.name}</h3>
                      {!s.active && <Badge variant="outline" className="text-[10px]">Paused</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.title}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7" onClick={() => toggleActive(s)} title={s.active ? "Pause" : "Resume"}>
                      {s.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7" onClick={() => openEdit(s)} title="Edit">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7 text-destructive" onClick={() => setDeleteId(s.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="secondary"><Repeat className="h-3 w-3 mr-1" /> {CADENCE_LABEL[s.cadence]}</Badge>
                  <Badge variant="outline"><Calendar className="h-3 w-3 mr-1" /> Next: {s.next_occurrence_at}</Badge>
                  {s.preferred_start_time && <Badge variant="outline">{s.preferred_start_time}</Badge>}
                </div>

                {customerName(s.customer_id) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserIcon className="h-3 w-3" /> {customerName(s.customer_id)}
                  </div>
                )}
                {s.property_address && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> <span className="truncate">{s.property_address}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit recurring schedule" : "New recurring schedule"}</DialogTitle></DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Schedule name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Smith Property — Monthly Clean" />
            </div>
            <div>
              <Label className="text-xs">Job title (used on each generated work order) *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Monthly clean" />
            </div>
            <div>
              <Label className="text-xs">Description / scope</Label>
              <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Customer</Label>
                <SearchableSelect
                  items={customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                    sublabel: c.company || c.email || undefined,
                    keywords: [c.email, c.phone, c.company].filter(Boolean).join(" "),
                  }))}
                  value={form.customer_id ?? ""}
                  onValueChange={(v) => setForm({ ...form, customer_id: v || null })}
                  placeholder="Select customer"
                  searchPlaceholder="Search customers..."
                  allowNone noneLabel="— None —"
                />
              </div>
              <div>
                <Label className="text-xs">Property address</Label>
                <Input value={form.property_address ?? ""} onChange={(e) => setForm({ ...form, property_address: e.target.value })} />
              </div>
            </div>

            <div>
              <Label className="text-xs">Default workers</Label>
              <div className="flex flex-wrap gap-1.5">
                {profiles.map((p) => {
                  const selected = form.member_profile_ids?.includes(p.id);
                  return (
                    <button
                      key={p.id} type="button"
                      onClick={() => {
                        const ids = new Set(form.member_profile_ids ?? []);
                        if (selected) ids.delete(p.id); else ids.add(p.id);
                        setForm({ ...form, member_profile_ids: [...ids] });
                      }}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${selected ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                    >
                      {p.name}
                    </button>
                  );
                })}
                {profiles.length === 0 && <p className="text-xs text-muted-foreground">No team members yet.</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cadence *</Label>
                <Select value={form.cadence} onValueChange={(v) => setForm({ ...form, cadence: v as RecurringJobCadence })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["weekly","fortnightly","monthly","quarterly"] as RecurringJobCadence[]).map((c) => (
                      <SelectItem key={c} value={c}>{CADENCE_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Generate days ahead</Label>
                <Input type="number" min={1} max={90} value={form.generate_days_ahead ?? 14} onChange={(e) => setForm({ ...form, generate_days_ahead: parseInt(e.target.value) || 14 })} />
              </div>
            </div>

            {(form.cadence === "weekly" || form.cadence === "fortnightly") && (
              <div>
                <Label className="text-xs">Preferred weekday</Label>
                <div className="flex gap-1">
                  {WEEKDAY_LABEL.map((d, i) => (
                    <button key={i} type="button" onClick={() => setForm({ ...form, preferred_weekday: i })}
                      className={`text-xs px-2.5 py-1 rounded border ${form.preferred_weekday === i ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(form.cadence === "monthly" || form.cadence === "quarterly") && (
              <div>
                <Label className="text-xs">Preferred day of month (1–28)</Label>
                <Input type="number" min={1} max={28} value={form.preferred_day_of_month ?? 1} onChange={(e) => setForm({ ...form, preferred_day_of_month: parseInt(e.target.value) || 1 })} />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Start time</Label>
                <Input type="time" value={form.preferred_start_time ?? ""} onChange={(e) => setForm({ ...form, preferred_start_time: e.target.value || null })} />
              </div>
              <div>
                <Label className="text-xs">Duration (min)</Label>
                <Input type="number" min={15} step={15} value={form.preferred_duration_minutes ?? ""} onChange={(e) => setForm({ ...form, preferred_duration_minutes: parseInt(e.target.value) || null })} />
              </div>
              <div>
                <Label className="text-xs">First occurrence *</Label>
                <Input type="date" value={form.next_occurrence_at} onChange={(e) => setForm({ ...form, next_occurrence_at: e.target.value })} />
              </div>
            </div>

            <div>
              <Label className="text-xs">Ends on (optional)</Label>
              <Input type="date" value={form.ends_on ?? ""} onChange={(e) => setForm({ ...form, ends_on: e.target.value || null })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : (editing ? "Save changes" : "Create schedule")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recurring schedule?</AlertDialogTitle>
            <AlertDialogDescription>Already-generated work orders are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
