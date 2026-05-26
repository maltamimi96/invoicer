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
  setBookingEnabled, setBookingSlug, updateBookingSettings,
  createAppointmentType, updateAppointmentType, deleteAppointmentType,
  createResource, deleteResource, updateResource,
  listWorkingHours, setWorkingHours,
  createException, deleteException, setAppointmentStatus,
  type TeamMemberLite,
} from "@/lib/actions/booking";
import type {
  BookingSettings, AppointmentType, BookingResource,
  BookingAvailabilityException, BookingWorkingHours, Appointment,
} from "@/types/database";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BookingAdminClient({
  initialSettings, initialTypes, initialResources, initialExceptions, initialAppointments, teamMembers, appUrl,
}: {
  initialSettings: BookingSettings;
  initialTypes: AppointmentType[];
  initialResources: BookingResource[];
  initialExceptions: BookingAvailabilityException[];
  initialAppointments: Appointment[];
  teamMembers: TeamMemberLite[];
  appUrl: string;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [types, setTypes] = useState(initialTypes);
  const [resources, setResources] = useState(initialResources);
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [slugInput, setSlugInput] = useState(settings.slug ?? "");
  const [pending, start] = useTransition();

  const fmtWhen = (iso: string) => new Intl.DateTimeFormat("en-AU", {
    timeZone: settings.timezone, weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
  const PILL: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700",
    completed: "bg-blue-100 text-blue-700", cancelled: "bg-rose-100 text-rose-700",
    rescheduled: "bg-violet-100 text-violet-700", no_show: "bg-zinc-200 text-zinc-600",
  };
  const changeStatus = (id: string, status: Appointment["status"]) => start(async () => {
    try {
      await setAppointmentStatus(id, status);
      setAppointments((arr) => arr.map((a) => a.id === id ? { ...a, status } : a));
      toast.success(`Marked ${status.replace("_", " ")}`);
    } catch (e) { toast.error((e as Error).message); }
  });
  const upcoming = appointments.filter((a) => a.status !== "cancelled");

  const publicUrl = settings.slug ? `${appUrl}/book/${settings.slug}` : null;
  const embedSnippet = settings.slug
    ? `<script src="${appUrl}/api/public/v1/biz/${settings.slug}/embed.js" async></script>`
    : null;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  const [dirty, setDirty] = useState(false);

  // Local-only field edit (no server round-trip per keystroke); persisted by
  // the explicit "Save changes" button below.
  const field = (patch: Partial<BookingSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setDirty(true);
  };

  const saveRules = () => start(async () => {
    try {
      await updateBookingSettings({
        timezone: settings.timezone,
        min_lead_minutes: settings.min_lead_minutes,
        max_advance_days: settings.max_advance_days,
        slot_granularity_minutes: settings.slot_granularity_minutes,
        default_buffer_minutes: settings.default_buffer_minutes,
        max_per_day: settings.max_per_day,
        cancellation_window_hours: settings.cancellation_window_hours,
        require_phone: settings.require_phone,
        require_email: settings.require_email,
        require_address: settings.require_address,
        create_lead: settings.create_lead,
        create_work_order: settings.create_work_order,
        confirmation_message: settings.confirmation_message,
      });
      setDirty(false);
      toast.success("Settings saved");
    } catch (e) { toast.error((e as Error).message); }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Online Booking"
        subtitle="Let customers book appointments from your website or a shareable link."
      />

      {/* Upcoming bookings */}
      <Card className="p-5 space-y-3">
        <div className="font-semibold flex items-center gap-1.5"><Calendar className="size-4" /> Upcoming bookings</div>
        {upcoming.length === 0 && <div className="text-sm text-muted-foreground">No upcoming bookings yet.</div>}
        <div className="space-y-2">
          {upcoming.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <div className="flex-1 min-w-[160px]">
                <div className="font-medium break-words">{a.customer_name}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtWhen(a.starts_at)}{a.customer_phone ? ` · ${a.customer_phone}` : ""}
                </div>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PILL[a.status] ?? "bg-zinc-100 text-zinc-600"}`}>
                {a.status.replace("_", " ")}
              </span>
              <div className="flex gap-1">
                {a.status !== "completed" && <Button size="sm" variant="outline" disabled={pending} onClick={() => changeStatus(a.id, "completed")}>Done</Button>}
                {a.status !== "no_show" && <Button size="sm" variant="outline" disabled={pending} onClick={() => changeStatus(a.id, "no_show")}>No-show</Button>}
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => changeStatus(a.id, "cancelled")}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Enable + public link */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Online booking</div>
            <div className="text-sm text-muted-foreground">
              {settings.enabled ? "Customers can book right now." : "Turn on to start taking bookings."}
            </div>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(v) => {
              setSettings((s) => ({ ...s, enabled: v }));
              start(async () => { try { await setBookingEnabled(v); toast.success(v ? "Booking enabled" : "Booking disabled"); } catch (e) { toast.error((e as Error).message); } });
            }}
          />
        </div>

        {/* Slug */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Link2 className="size-3.5" /> Booking link</Label>
          <div className="flex gap-2">
            <div className="flex items-center rounded-md border bg-muted/40 px-2 text-sm text-muted-foreground">{appUrl}/book/</div>
            <Input value={slugInput} placeholder="your-business" onChange={(e) => setSlugInput(e.target.value)} className="flex-1" />
            <Button variant="outline" disabled={pending} onClick={() => start(async () => {
              const res = await setBookingSlug(slugInput);
              if (res.ok) { setSettings((s) => ({ ...s, slug: slugInput.trim().toLowerCase() })); toast.success("Link saved"); }
              else toast.error(res.error ?? "Couldn't save link");
            })}>Save</Button>
          </div>
        </div>

        {publicUrl && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(publicUrl, "Booking link")}><Copy className="size-3.5 mr-1" /> Copy link</Button>
            <a href={publicUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink className="size-3.5 mr-1" /> Preview</Button></a>
            {embedSnippet && <Button size="sm" variant="outline" onClick={() => copy(embedSnippet, "Embed snippet")}><Copy className="size-3.5 mr-1" /> Copy embed code</Button>}
          </div>
        )}
        {embedSnippet && (
          <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto break-all whitespace-pre-wrap">{embedSnippet}</pre>
        )}
      </Card>

      {/* Booking rules */}
      <Card className="p-5 space-y-4">
        <div className="font-semibold flex items-center gap-1.5"><Clock className="size-4" /> Booking rules</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Timezone">
            <Input value={settings.timezone} onChange={(e) => field({ timezone: e.target.value })} />
          </Field>
          <NumField label="Min notice (minutes)" value={settings.min_lead_minutes} onChange={(v) => field({ min_lead_minutes: v })} />
          <NumField label="Book up to (days ahead)" value={settings.max_advance_days} onChange={(v) => field({ max_advance_days: v })} />
          <NumField label="Slot interval (minutes)" value={settings.slot_granularity_minutes} onChange={(v) => field({ slot_granularity_minutes: v })} />
          <NumField label="Buffer between jobs (minutes)" value={settings.default_buffer_minutes} onChange={(v) => field({ default_buffer_minutes: v })} />
          <NumField label="Max bookings per day (0 = unlimited)" value={settings.max_per_day ?? 0} onChange={(v) => field({ max_per_day: v === 0 ? null : v })} />
          <NumField label="Cancellation notice (hours)" value={settings.cancellation_window_hours} onChange={(v) => field({ cancellation_window_hours: v })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <ToggleRow label="Require phone" checked={settings.require_phone} onChange={(v) => field({ require_phone: v })} />
          <ToggleRow label="Require email" checked={settings.require_email} onChange={(v) => field({ require_email: v })} />
          <ToggleRow label="Require address" checked={settings.require_address} onChange={(v) => field({ require_address: v })} />
          <ToggleRow label="Show worker names publicly" checked={settings.show_resource_names} onChange={(v) => field({ show_resource_names: v })} />
          <ToggleRow label="Create a lead per booking" checked={settings.create_lead} onChange={(v) => field({ create_lead: v })} />
          <ToggleRow label="Create a work order per booking" checked={settings.create_work_order} onChange={(v) => field({ create_work_order: v })} />
        </div>

        <Field label="Confirmation message (shown after booking)">
          <Textarea value={settings.confirmation_message ?? ""} placeholder="Thanks! We'll see you then." onChange={(e) => field({ confirmation_message: e.target.value || null })} />
        </Field>

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={saveRules} disabled={pending || !dirty}>
            {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">You have unsaved changes</span>}
        </div>
      </Card>

      {/* Appointment types */}
      <Card className="p-5 space-y-4">
        <div className="font-semibold flex items-center gap-1.5"><Calendar className="size-4" /> Services</div>
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

      {/* Resources + working hours */}
      <Card className="p-5 space-y-4">
        <div className="font-semibold flex items-center gap-1.5"><Users className="size-4" /> Team / resources & hours</div>
        <p className="text-xs text-muted-foreground -mt-1">Link a resource to a team member to auto-block their existing jobs and assign new bookings to them — or leave it generic (e.g. “Bay 1”).</p>
        <div className="space-y-3">
          {resources.map((r) => (
            <ResourceRow key={r.id} resource={r} teamMembers={teamMembers}
              onLink={(memberId) => start(async () => { await updateResource(r.id, { member_profile_id: memberId }); setResources((arr) => arr.map((x) => x.id === r.id ? { ...x, member_profile_id: memberId } : x)); })}
              onDelete={() => start(async () => { await deleteResource(r.id); setResources((arr) => arr.filter((x) => x.id !== r.id)); })} />
          ))}
          {resources.length === 0 && <div className="text-sm text-muted-foreground">Add at least one bookable person/resource.</div>}
        </div>
        <AddResource teamMembers={teamMembers} existing={resources} onAdd={(row) => setResources((arr) => [...arr, row])} />
      </Card>

      {/* Blackout dates */}
      <Card className="p-5 space-y-4">
        <div className="font-semibold">Blackout dates</div>
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

// ---- small field helpers ----
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
        try {
          const row = await createAppointmentType({ name, durationMinutes: parseInt(duration) || 60, priceDisplay: price || undefined });
          onAdd(row); setName(""); setDuration("60"); setPrice(""); toast.success("Service added");
        } catch (e) { toast.error((e as Error).message); }
      })}><Plus className="size-4 mr-1" /> Add</Button>
    </div>
  );
}

function AddResource({ teamMembers, onAdd }: { teamMembers: TeamMemberLite[]; existing: BookingResource[]; onAdd: (row: BookingResource) => void }) {
  const [name, setName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [pending, start] = useTransition();
  const pickMember = (id: string) => {
    setMemberId(id);
    const m = teamMembers.find((x) => x.id === id);
    if (m?.name && !name.trim()) setName(m.name.split(" ")[0]); // prefill first name
  };
  return (
    <div className="flex flex-wrap gap-2 items-end border-t pt-4">
      {teamMembers.length > 0 && (
        <div><Label className="text-xs">Team member</Label>
          <select value={memberId} onChange={(e) => pickMember(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm">
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
  const [hours, setHours] = useState<{ enabled: boolean; start: string; end: string }[]>(
    DAYS.map(() => ({ enabled: false, start: "09:00", end: "17:00" })),
  );
  const [loaded, setLoaded] = useState(false);
  const [pending, start] = useTransition();

  const expand = () => {
    setOpen((o) => !o);
    if (!loaded) {
      start(async () => {
        const rows = await listWorkingHours(resource.id);
        const next = DAYS.map((_, wd) => {
          const row = (rows as BookingWorkingHours[]).find((r) => r.weekday === wd);
          return row ? { enabled: true, start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) } : { enabled: false, start: "09:00", end: "17:00" };
        });
        setHours(next); setLoaded(true);
      });
    }
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
          <select value={resource.member_profile_id ?? ""} onChange={(e) => onLink(e.target.value || null)}
            className="h-8 rounded-md border bg-background px-2 text-xs">
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
        try {
          await createException({ date, isClosed: true });
          // optimistic local row; server revalidates the list too
          onAdd({ id: crypto.randomUUID(), business_id: "", resource_id: null, date, is_closed: true, start_time: null, end_time: null, reason: null, created_at: new Date().toISOString() });
          setDate(""); toast.success("Blackout date added");
        } catch (e) { toast.error((e as Error).message); }
      })}><Plus className="size-4 mr-1" /> Add</Button>
    </div>
  );
}
