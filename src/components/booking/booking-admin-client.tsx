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
  createResource, deleteResource,
  listWorkingHours, setWorkingHours,
  createException, deleteException,
} from "@/lib/actions/booking";
import type {
  BookingSettings, AppointmentType, BookingResource,
  BookingAvailabilityException, BookingWorkingHours,
} from "@/types/database";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BookingAdminClient({
  initialSettings, initialTypes, initialResources, initialExceptions, appUrl,
}: {
  initialSettings: BookingSettings;
  initialTypes: AppointmentType[];
  initialResources: BookingResource[];
  initialExceptions: BookingAvailabilityException[];
  appUrl: string;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [types, setTypes] = useState(initialTypes);
  const [resources, setResources] = useState(initialResources);
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [slugInput, setSlugInput] = useState(settings.slug ?? "");
  const [pending, start] = useTransition();

  const publicUrl = settings.slug ? `${appUrl}/book/${settings.slug}` : null;
  const embedSnippet = settings.slug
    ? `<script src="${appUrl}/api/public/v1/biz/${settings.slug}/embed.js" async></script>`
    : null;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  const patchSettings = (patch: Partial<BookingSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    start(async () => {
      try { await updateBookingSettings(patch); } catch (e) { toast.error((e as Error).message); }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Online Booking"
        subtitle="Let customers book appointments from your website or a shareable link."
      />

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
            <Input value={settings.timezone} onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))} onBlur={(e) => patchSettings({ timezone: e.target.value })} />
          </Field>
          <NumField label="Min notice (minutes)" value={settings.min_lead_minutes} onCommit={(v) => patchSettings({ min_lead_minutes: v })} />
          <NumField label="Book up to (days ahead)" value={settings.max_advance_days} onCommit={(v) => patchSettings({ max_advance_days: v })} />
          <NumField label="Slot interval (minutes)" value={settings.slot_granularity_minutes} onCommit={(v) => patchSettings({ slot_granularity_minutes: v })} />
          <NumField label="Buffer between jobs (minutes)" value={settings.default_buffer_minutes} onCommit={(v) => patchSettings({ default_buffer_minutes: v })} />
          <NumField label="Max bookings per day (0 = unlimited)" value={settings.max_per_day ?? 0} onCommit={(v) => patchSettings({ max_per_day: v === 0 ? null : v })} />
          <NumField label="Cancellation notice (hours)" value={settings.cancellation_window_hours} onCommit={(v) => patchSettings({ cancellation_window_hours: v })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <ToggleRow label="Require phone" checked={settings.require_phone} onChange={(v) => patchSettings({ require_phone: v })} />
          <ToggleRow label="Require email" checked={settings.require_email} onChange={(v) => patchSettings({ require_email: v })} />
          <ToggleRow label="Require address" checked={settings.require_address} onChange={(v) => patchSettings({ require_address: v })} />
          <ToggleRow label="Create a lead per booking" checked={settings.create_lead} onChange={(v) => patchSettings({ create_lead: v })} />
          <ToggleRow label="Create a work order per booking" checked={settings.create_work_order} onChange={(v) => patchSettings({ create_work_order: v })} />
        </div>

        <Field label="Confirmation message (shown after booking)">
          <Textarea value={settings.confirmation_message ?? ""} placeholder="Thanks! We'll see you then." onChange={(e) => setSettings((s) => ({ ...s, confirmation_message: e.target.value }))} onBlur={(e) => patchSettings({ confirmation_message: e.target.value || null })} />
        </Field>
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
        <div className="space-y-3">
          {resources.map((r) => (
            <ResourceRow key={r.id} resource={r}
              onDelete={() => start(async () => { await deleteResource(r.id); setResources((arr) => arr.filter((x) => x.id !== r.id)); })} />
          ))}
          {resources.length === 0 && <div className="text-sm text-muted-foreground">Add at least one bookable person/resource.</div>}
        </div>
        <AddResource onAdd={(row) => setResources((arr) => [...arr, row])} />
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
function NumField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return <Field label={label}><Input type="number" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onCommit(Math.max(0, parseInt(v) || 0))} /></Field>;
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

function AddResource({ onAdd }: { onAdd: (row: BookingResource) => void }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2 items-end border-t pt-4">
      <div className="flex-1"><Label className="text-xs">Display name (public)</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sam" /></div>
      <Button disabled={pending || !name.trim()} onClick={() => start(async () => {
        try { const row = await createResource({ displayName: name }); onAdd(row); setName(""); toast.success("Resource added"); }
        catch (e) { toast.error((e as Error).message); }
      })}><Plus className="size-4 mr-1" /> Add</Button>
    </div>
  );
}

function ResourceRow({ resource, onDelete }: { resource: BookingResource; onDelete: () => void }) {
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
      <div className="flex items-center gap-3 p-3">
        <div className="flex-1 font-medium">{resource.display_name}</div>
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
