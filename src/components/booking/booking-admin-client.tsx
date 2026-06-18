"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Plus, Trash2, Calendar, Clock, Users, Link2, ExternalLink } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createForm, updateForm, setFormSlug, deleteForm,
  createAppointmentType, updateAppointmentType, deleteAppointmentType,
  createResource, deleteResource, updateResource,
  listWorkingHours, setWorkingHours,
  createException, deleteException, setAppointmentStatus, setBlockUntimedJobs,
  type TeamMemberLite,
} from "@/lib/actions/booking";
import type {
  BookingForm, AppointmentType, BookingResource,
  BookingAvailabilityException, BookingWorkingHours, Appointment,
} from "@/types/database";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PILL: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700", cancelled: "bg-rose-100 text-rose-700",
  rescheduled: "bg-violet-100 text-violet-700", no_show: "bg-zinc-200 text-zinc-600",
};

export function BookingAdminClient({
  initialForms, initialTypes, initialResources, initialExceptions, initialAppointments, teamMembers, blockUntimedJobs, appUrl,
}: {
  initialForms: BookingForm[];
  initialTypes: AppointmentType[];
  initialResources: BookingResource[];
  initialExceptions: BookingAvailabilityException[];
  initialAppointments: Appointment[];
  teamMembers: TeamMemberLite[];
  blockUntimedJobs: boolean;
  appUrl: string;
}) {
  const [blockUntimed, setBlockUntimed] = useState(blockUntimedJobs);
  const [forms, setForms] = useState(initialForms);
  const [types, setTypes] = useState(initialTypes);
  const [resources, setResources] = useState(initialResources);
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(initialForms[0]?.id ?? null);
  const [newFormName, setNewFormName] = useState("");
  const [pending, start] = useTransition();

  const tz = forms[0]?.timezone || "Australia/Sydney";
  const fmtWhen = (iso: string) => new Intl.DateTimeFormat("en-AU", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
  const changeStatus = (id: string, status: Appointment["status"]) => start(async () => {
    try { await setAppointmentStatus(id, status); setAppointments((arr) => arr.map((a) => a.id === id ? { ...a, status } : a)); toast.success(`Marked ${status.replace("_", " ")}`); }
    catch (e) { toast.error((e as Error).message); }
  });
  const upcoming = appointments.filter((a) => a.status !== "cancelled");
  const selectedForm = forms.find((f) => f.id === selectedFormId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Online Booking" subtitle="Publish one or more booking forms. Services, team and hours below are shared across all forms." />

      {/* Upcoming bookings */}
      <Card className="p-5 space-y-3">
        <div className="font-semibold flex items-center gap-1.5"><Calendar className="size-4" /> Upcoming bookings</div>
        {upcoming.length === 0 && <div className="text-sm text-muted-foreground">No upcoming bookings yet.</div>}
        <div className="space-y-2">
          {upcoming.slice(0, 8).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <div className="flex-1 min-w-[160px]">
                <div className="font-medium break-words">{a.customer_name}</div>
                <div className="text-xs text-muted-foreground">{fmtWhen(a.starts_at)}{a.customer_phone ? ` · ${a.customer_phone}` : ""}</div>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PILL[a.status] ?? "bg-zinc-100 text-zinc-600"}`}>{a.status.replace("_", " ")}</span>
              <div className="flex gap-1">
                {a.status !== "completed" && <Button size="sm" variant="outline" disabled={pending} onClick={() => changeStatus(a.id, "completed")}>Done</Button>}
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => changeStatus(a.id, "cancelled")}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </div>
        <a href="/bookings" className="text-sm text-primary inline-flex items-center gap-1">View all bookings <ExternalLink className="size-3.5" /></a>
      </Card>

      {/* Forms manager */}
      <Card className="p-5 space-y-4">
        <div className="font-semibold flex items-center gap-1.5"><Link2 className="size-4" /> Booking forms</div>
        <div className="flex flex-wrap gap-2">
          {forms.map((f) => (
            <button key={f.id} onClick={() => setSelectedFormId(f.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border ${selectedFormId === f.id ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"}`}>
              {f.name} {f.enabled ? <span className="opacity-70">· live</span> : <span className="opacity-50">· off</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-end border-t pt-4">
          <div className="flex-1"><Label className="text-xs">New form name</Label><Input value={newFormName} onChange={(e) => setNewFormName(e.target.value)} placeholder="e.g. Emergency Callouts" /></div>
          <Button disabled={pending || !newFormName.trim()} onClick={() => start(async () => {
            try { const f = await createForm(newFormName); setForms((arr) => [...arr, f]); setSelectedFormId(f.id); setNewFormName(""); toast.success("Form created"); }
            catch (e) { toast.error((e as Error).message); }
          })}><Plus className="size-4 mr-1" /> Add form</Button>
        </div>
      </Card>

      {/* Selected form editor */}
      {selectedForm && (
        <FormEditor key={selectedForm.id} form={selectedForm} types={types} resources={resources} appUrl={appUrl}
          onChange={(f) => setForms((arr) => arr.map((x) => x.id === f.id ? f : x))}
          onDelete={() => start(async () => {
            if (forms.length <= 1) { toast.error("Keep at least one form."); return; }
            await deleteForm(selectedForm.id);
            setForms((arr) => arr.filter((x) => x.id !== selectedForm.id));
            setSelectedFormId(forms.find((x) => x.id !== selectedForm.id)?.id ?? null);
            toast.success("Form deleted");
          })} />
      )}

      {/* Shared: Services */}
      <Card className="p-5 space-y-4">
        <div className="font-semibold flex items-center gap-1.5"><Calendar className="size-4" /> Services <span className="text-xs font-normal text-muted-foreground">(shared library)</span></div>
        <div className="space-y-2">
          {types.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-md border p-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium break-words">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.duration_minutes} min{t.price_display ? ` · ${t.price_display}` : ""}{t.active ? "" : " · hidden"}</div>
              </div>
              <Switch checked={t.active} onCheckedChange={(v) => start(async () => { await updateAppointmentType(t.id, { active: v }); setTypes((arr) => arr.map((x) => x.id === t.id ? { ...x, active: v } : x)); })} />
              <Button size="icon" variant="ghost" onClick={() => start(async () => { await deleteAppointmentType(t.id); setTypes((arr) => arr.filter((x) => x.id !== t.id)); toast.success("Service removed"); })}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          {types.length === 0 && <div className="text-sm text-muted-foreground">No services yet — add one below.</div>}
        </div>
        <AddType onAdd={(row) => setTypes((arr) => [...arr, row])} />
      </Card>

      {/* Shared: Resources + hours */}
      <Card className="p-5 space-y-4">
        <div className="font-semibold flex items-center gap-1.5"><Users className="size-4" /> Team / resources & hours <span className="text-xs font-normal text-muted-foreground">(shared library)</span></div>
        <p className="text-xs text-muted-foreground -mt-1">Link a resource to a team member to auto-block their existing jobs and assign new bookings to them — or leave it generic (e.g. “Bay 1”).</p>
        <div className="flex items-center justify-between rounded-md border p-3">
          <span className="text-sm">Block the whole day when a linked worker has an <strong>untimed</strong> job<br /><span className="text-xs text-muted-foreground">Timed jobs always block their exact slot. Off = untimed/all-day jobs don’t affect availability.</span></span>
          <Switch checked={blockUntimed} onCheckedChange={(v) => { setBlockUntimed(v); start(async () => { try { await setBlockUntimedJobs(v); toast.success(v ? "Untimed jobs now block the day" : "Untimed jobs no longer block"); } catch (e) { toast.error((e as Error).message); } }); }} />
        </div>
        <div className="space-y-3">
          {resources.map((r) => (
            <ResourceRow key={r.id} resource={r} teamMembers={teamMembers}
              onLink={(memberId) => start(async () => { await updateResource(r.id, { member_profile_id: memberId }); setResources((arr) => arr.map((x) => x.id === r.id ? { ...x, member_profile_id: memberId } : x)); })}
              onDelete={() => start(async () => { await deleteResource(r.id); setResources((arr) => arr.filter((x) => x.id !== r.id)); })} />
          ))}
          {resources.length === 0 && <div className="text-sm text-muted-foreground">Add at least one bookable person/resource.</div>}
        </div>
        <AddResource teamMembers={teamMembers} onAdd={(row) => setResources((arr) => [...arr, row])} />
      </Card>

      {/* Shared: Blackout dates */}
      <Card className="p-5 space-y-4">
        <div className="font-semibold">Blackout dates <span className="text-xs font-normal text-muted-foreground">(shared library)</span></div>
        <div className="space-y-2">
          {exceptions.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <div className="flex-1">{e.date} — {e.is_closed ? "Closed" : `${e.start_time}–${e.end_time}`}{e.reason ? ` (${e.reason})` : ""}</div>
              <Button size="icon" variant="ghost" onClick={() => start(async () => { await deleteException(e.id); setExceptions((arr) => arr.filter((x) => x.id !== e.id)); })}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          {exceptions.length === 0 && <div className="text-sm text-muted-foreground">No blackout dates.</div>}
        </div>
        <AddException onAdd={(row) => setExceptions((arr) => [...arr, row].sort((a, b) => a.date.localeCompare(b.date)))} />
      </Card>
    </div>
  );
}

// ============================ Per-form editor ============================
function FormEditor({ form: initial, types, resources, appUrl, onChange, onDelete }: {
  form: BookingForm; types: AppointmentType[]; resources: BookingResource[]; appUrl: string;
  onChange: (f: BookingForm) => void; onDelete: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [slugInput, setSlugInput] = useState(initial.slug ?? "");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const publicUrl = form.slug ? `${appUrl}/book/${form.slug}` : null;
  const embedSnippet = form.slug ? `<script src="${appUrl}/api/public/v1/biz/${form.slug}/embed.js" async></script>` : null;
  const copy = (text: string, label: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));

  const field = (patch: Partial<BookingForm>) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const toggleId = (key: "appointment_type_ids" | "resource_ids", id: string) =>
    field({ [key]: form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id] } as Partial<BookingForm>);

  const saveAll = () => start(async () => {
    try {
      await updateForm(form.id, {
        name: form.name, timezone: form.timezone, min_lead_minutes: form.min_lead_minutes,
        max_advance_days: form.max_advance_days, slot_granularity_minutes: form.slot_granularity_minutes,
        default_buffer_minutes: form.default_buffer_minutes, max_per_day: form.max_per_day,
        require_phone: form.require_phone, require_email: form.require_email, require_address: form.require_address,
        show_resource_names: form.show_resource_names, confirmation_message: form.confirmation_message,
        cancellation_window_hours: form.cancellation_window_hours, create_lead: form.create_lead,
        create_work_order: form.create_work_order, appointment_type_ids: form.appointment_type_ids,
        resource_ids: form.resource_ids,
      });
      setDirty(false); onChange(form); toast.success("Form saved");
    } catch (e) { toast.error((e as Error).message); }
  });

  return (
    <Card className="p-5 space-y-5 border-primary/40">
      {/* name + enable + delete */}
      <div className="flex flex-wrap items-center gap-3">
        <Input value={form.name} onChange={(e) => field({ name: e.target.value })} className="flex-1 min-w-[160px] font-semibold" />
        <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">Live</span>
          <Switch checked={form.enabled} onCheckedChange={(v) => { setForm((f) => ({ ...f, enabled: v })); start(async () => { try { await updateForm(form.id, { enabled: v }); onChange({ ...form, enabled: v }); toast.success(v ? "Form is live" : "Form turned off"); } catch (e) { toast.error((e as Error).message); } }); }} />
        </div>
        <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="size-4" /></Button>
      </div>

      {/* slug + link */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5"><Link2 className="size-3.5" /> Booking link</Label>
        <div className="flex gap-2">
          <div className="flex items-center rounded-md border bg-muted/40 px-2 text-sm text-muted-foreground">{appUrl}/book/</div>
          <Input value={slugInput} placeholder="emergency-callouts" onChange={(e) => setSlugInput(e.target.value)} className="flex-1" />
          <Button variant="outline" disabled={pending} onClick={() => start(async () => {
            const res = await setFormSlug(form.id, slugInput);
            if (res.ok) { const slug = slugInput.trim().toLowerCase(); setForm((f) => ({ ...f, slug })); onChange({ ...form, slug }); toast.success("Link saved"); }
            else toast.error(res.error ?? "Couldn't save link");
          })}>Save</Button>
        </div>
        {publicUrl && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => copy(publicUrl, "Booking link")}><Copy className="size-3.5 mr-1" /> Copy link</Button>
            <a href={publicUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink className="size-3.5 mr-1" /> Preview</Button></a>
            {embedSnippet && <Button size="sm" variant="outline" onClick={() => copy(embedSnippet, "Embed snippet")}><Copy className="size-3.5 mr-1" /> Copy embed code</Button>}
          </div>
        )}
      </div>

      {/* service + resource selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Services on this form <span className="text-muted-foreground">(none = all)</span></Label>
          <div className="mt-1.5 space-y-1.5">
            {types.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.appointment_type_ids.includes(t.id)} onChange={() => toggleId("appointment_type_ids", t.id)} />
                {t.name}
              </label>
            ))}
            {types.length === 0 && <div className="text-xs text-muted-foreground">Add services in the shared library below.</div>}
          </div>
        </div>
        <div>
          <Label className="text-xs">Workers / resources on this form <span className="text-muted-foreground">(none = all)</span></Label>
          <div className="mt-1.5 space-y-1.5">
            {resources.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.resource_ids.includes(r.id)} onChange={() => toggleId("resource_ids", r.id)} />
                {r.display_name}{r.member_profile_id ? " (worker)" : ""}
              </label>
            ))}
            {resources.length === 0 && <div className="text-xs text-muted-foreground">Add resources in the shared library below.</div>}
          </div>
        </div>
      </div>

      {/* rules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Timezone"><Input value={form.timezone} onChange={(e) => field({ timezone: e.target.value })} /></Field>
        <NumField label="Min notice (minutes)" value={form.min_lead_minutes} onChange={(v) => field({ min_lead_minutes: v })} />
        <NumField label="Book up to (days ahead)" value={form.max_advance_days} onChange={(v) => field({ max_advance_days: v })} />
        <NumField label="Slot interval (minutes)" value={form.slot_granularity_minutes} onChange={(v) => field({ slot_granularity_minutes: v })} />
        <NumField label="Buffer between jobs (minutes)" value={form.default_buffer_minutes} onChange={(v) => field({ default_buffer_minutes: v })} />
        <NumField label="Max bookings per day (0 = unlimited)" value={form.max_per_day ?? 0} onChange={(v) => field({ max_per_day: v === 0 ? null : v })} />
        <NumField label="Cancellation notice (hours)" value={form.cancellation_window_hours} onChange={(v) => field({ cancellation_window_hours: v })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ToggleRow label="Require phone" checked={form.require_phone} onChange={(v) => field({ require_phone: v })} />
        <ToggleRow label="Require email" checked={form.require_email} onChange={(v) => field({ require_email: v })} />
        <ToggleRow label="Require address" checked={form.require_address} onChange={(v) => field({ require_address: v })} />
        <ToggleRow label="Show worker names publicly" checked={form.show_resource_names} onChange={(v) => field({ show_resource_names: v })} />
        <ToggleRow label="Create a lead per booking" checked={form.create_lead} onChange={(v) => field({ create_lead: v })} />
        <ToggleRow label="Create a work order per booking" checked={form.create_work_order} onChange={(v) => field({ create_work_order: v })} />
      </div>
      <Field label="Confirmation message (shown after booking)">
        <Textarea value={form.confirmation_message ?? ""} placeholder="Thanks! We'll see you then." onChange={(e) => field({ confirmation_message: e.target.value || null })} />
      </Field>

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={saveAll} disabled={pending || !dirty}>{pending ? "Saving…" : dirty ? "Save form" : "Saved"}</Button>
        {dirty && <span className="text-xs text-muted-foreground">You have unsaved changes</span>}
      </div>
    </Card>
  );
}

// ---- shared helpers ----
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return <Field label={label}><Input type="number" value={v} onChange={(e) => { setV(e.target.value); onChange(Math.max(0, parseInt(e.target.value) || 0)); }} /></Field>;
}
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-md border p-3"><span className="text-sm">{label}</span><Switch checked={checked} onCheckedChange={onChange} /></div>;
}

function AddType({ onAdd }: { onAdd: (row: AppointmentType) => void }) {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("60");
  const [price, setPrice] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2 items-end border-t pt-4">
      <div className="flex-1 min-w-[160px]"><Label className="text-xs">Service name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Free inspection" /></div>
      <div className="w-24"><Label className="text-xs">Minutes</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
      <div className="w-32"><Label className="text-xs">Price (text)</Label><Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Free" /></div>
      <Button disabled={pending || !name.trim()} onClick={() => start(async () => {
        try { const row = await createAppointmentType({ name, durationMinutes: parseInt(duration) || 60, priceDisplay: price || undefined }); onAdd(row); setName(""); setDuration("60"); setPrice(""); toast.success("Service added"); }
        catch (e) { toast.error((e as Error).message); }
      })}><Plus className="size-4 mr-1" /> Add</Button>
    </div>
  );
}

function AddResource({ teamMembers, onAdd }: { teamMembers: TeamMemberLite[]; onAdd: (row: BookingResource) => void }) {
  const [name, setName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [pending, start] = useTransition();
  const pickMember = (id: string) => { setMemberId(id); const m = teamMembers.find((x) => x.id === id); if (m?.name && !name.trim()) setName(m.name.split(" ")[0]); };
  return (
    <div className="flex flex-wrap gap-2 items-end border-t pt-4">
      {teamMembers.length > 0 && (
        <div><Label className="text-xs">Team member</Label>
          <select value={memberId} onChange={(e) => pickMember(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Generic (no worker)</option>
            {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
        </div>
      )}
      <div className="flex-1 min-w-[140px]"><Label className="text-xs">Display name (public)</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sam" /></div>
      <Button disabled={pending || !name.trim()} onClick={() => start(async () => {
        try { const row = await createResource({ displayName: name, memberProfileId: memberId || null }); onAdd(row); setName(""); setMemberId(""); toast.success("Resource added"); }
        catch (e) { toast.error((e as Error).message); }
      })}><Plus className="size-4 mr-1" /> Add</Button>
    </div>
  );
}

function ResourceRow({ resource, teamMembers, onLink, onDelete }: { resource: BookingResource; teamMembers: TeamMemberLite[]; onLink: (memberId: string | null) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<{ enabled: boolean; start: string; end: string }[]>(DAYS.map(() => ({ enabled: false, start: "09:00", end: "17:00" })));
  const [loaded, setLoaded] = useState(false);
  const [pending, start] = useTransition();

  const expand = () => {
    setOpen((o) => !o);
    if (!loaded) start(async () => {
      const rows = await listWorkingHours(resource.id);
      setHours(DAYS.map((_, wd) => { const row = (rows as BookingWorkingHours[]).find((r) => r.weekday === wd); return row ? { enabled: true, start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) } : { enabled: false, start: "09:00", end: "17:00" }; }));
      setLoaded(true);
    });
  };
  const save = () => start(async () => {
    const blocks = hours.map((h, wd) => h.enabled ? { weekday: wd, start_time: h.start, end_time: h.end } : null).filter(Boolean) as { weekday: number; start_time: string; end_time: string }[];
    try { await setWorkingHours(resource.id, blocks); toast.success("Hours saved"); } catch (e) { toast.error((e as Error).message); }
  });

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex-1 min-w-[120px]">
          <div className="font-medium">{resource.display_name}</div>
          <div className="text-xs text-muted-foreground">{resource.member_profile_id ? "Linked worker" : "Generic resource"}</div>
        </div>
        {teamMembers.length > 0 && (
          <select value={resource.member_profile_id ?? ""} onChange={(e) => onLink(e.target.value || null)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="">Generic</option>
            {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
        )}
        <Button size="sm" variant="outline" onClick={expand}>{open ? "Hide hours" : "Set hours"}</Button>
        <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="size-4" /></Button>
      </div>
      {open && (
        <div className="border-t p-3 space-y-2">
          {DAYS.map((d, wd) => (
            <div key={d} className="flex items-center gap-2">
              <Switch checked={hours[wd].enabled} onCheckedChange={(v) => setHours((h) => h.map((x, i) => i === wd ? { ...x, enabled: v } : x))} />
              <span className="w-10 text-sm">{d}</span>
              <Input type="time" value={hours[wd].start} disabled={!hours[wd].enabled} className="w-32" onChange={(e) => setHours((h) => h.map((x, i) => i === wd ? { ...x, start: e.target.value } : x))} />
              <span className="text-muted-foreground">–</span>
              <Input type="time" value={hours[wd].end} disabled={!hours[wd].enabled} className="w-32" onChange={(e) => setHours((h) => h.map((x, i) => i === wd ? { ...x, end: e.target.value } : x))} />
            </div>
          ))}
          <Button size="sm" disabled={pending} onClick={save}>Save hours</Button>
        </div>
      )}
    </div>
  );
}

function AddException({ onAdd }: { onAdd: (row: BookingAvailabilityException) => void }) {
  const [date, setDate] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2 items-end border-t pt-4">
      <div><Label className="text-xs">Closed date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <Button disabled={pending || !date} onClick={() => start(async () => {
        try { await createException({ date, isClosed: true }); onAdd({ id: crypto.randomUUID(), business_id: "", resource_id: null, date, is_closed: true, start_time: null, end_time: null, reason: null, created_at: new Date().toISOString() }); setDate(""); toast.success("Blackout date added"); }
        catch (e) { toast.error((e as Error).message); }
      })}><Plus className="size-4 mr-1" /> Add</Button>
    </div>
  );
}
