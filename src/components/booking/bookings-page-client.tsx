"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Calendar, Phone, Mail, MapPin, User, Clock, FileText, UserPlus, ExternalLink } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  getAppointmentDetail, setAppointmentStatus, type AppointmentDetail,
} from "@/lib/actions/booking";
import type { Appointment } from "@/types/database";

type Tab = "upcoming" | "today" | "past" | "cancelled" | "all";

const PILL: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700", cancelled: "bg-rose-100 text-rose-700",
  rescheduled: "bg-violet-100 text-violet-700", no_show: "bg-zinc-200 text-zinc-600",
};

export function BookingsPageClient({ initialAppointments, timezone }: { initialAppointments: Appointment[]; timezone: string }) {
  const [appts, setAppts] = useState(initialAppointments);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pending, start] = useTransition();

  const fmt = (iso: string) => new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));

  const now = Date.now();
  const counts = useMemo(() => ({
    upcoming: appts.filter((a) => a.status !== "cancelled" && new Date(a.starts_at).getTime() >= now).length,
    today: appts.filter((a) => a.status !== "cancelled" && new Date(a.starts_at).toDateString() === new Date().toDateString()).length,
    past: appts.filter((a) => new Date(a.starts_at).getTime() < now && a.status !== "cancelled").length,
    cancelled: appts.filter((a) => a.status === "cancelled").length,
    all: appts.length,
  }), [appts, now]);

  const filtered = useMemo(() => {
    const byTab = appts.filter((a) => {
      const t = new Date(a.starts_at).getTime();
      if (tab === "upcoming") return a.status !== "cancelled" && t >= now;
      if (tab === "today") return a.status !== "cancelled" && new Date(a.starts_at).toDateString() === new Date().toDateString();
      if (tab === "past") return t < now && a.status !== "cancelled";
      if (tab === "cancelled") return a.status === "cancelled";
      return true;
    });
    return byTab.sort((a, b) => tab === "past" ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at));
  }, [appts, tab, now]);

  const openDetail = (id: string) => {
    setOpenId(id); setDetail(null); setLoadingDetail(true);
    getAppointmentDetail(id).then((d) => setDetail(d)).finally(() => setLoadingDetail(false));
  };

  const changeStatus = (id: string, status: Appointment["status"]) => start(async () => {
    try {
      await setAppointmentStatus(id, status);
      setAppts((arr) => arr.map((a) => a.id === id ? { ...a, status } : a));
      setDetail((d) => d && d.appointment.id === id ? { ...d, appointment: { ...d.appointment, status } } : d);
      toast.success(`Marked ${status.replace("_", " ")}`);
    } catch (e) { toast.error((e as Error).message); }
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: "upcoming", label: "Upcoming" }, { key: "today", label: "Today" },
    { key: "past", label: "Past" }, { key: "cancelled", label: "Cancelled" }, { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" subtitle="Appointments booked through your online booking page." />

      {/* tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${tab === t.key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"}`}>
            {t.label} <span className="opacity-60">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <Card className="divide-y">
        {filtered.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No bookings here.</div>}
        {filtered.map((a) => (
          <button key={a.id} onClick={() => openDetail(a.id)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors">
            <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
              {a.customer_name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium break-words">{a.customer_name}</div>
              <div className="text-xs text-muted-foreground">{fmt(a.starts_at)}</div>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${PILL[a.status] ?? "bg-zinc-100 text-zinc-600"}`}>{a.status.replace("_", " ")}</span>
          </button>
        ))}
      </Card>

      {/* detail modal */}
      <Dialog open={openId !== null} onOpenChange={(o) => { if (!o) { setOpenId(null); setDetail(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Booking details</DialogTitle></DialogHeader>
          {loadingDetail && <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}
          {detail && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{detail.appointment.customer_name}</div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PILL[detail.appointment.status] ?? "bg-zinc-100 text-zinc-600"}`}>{detail.appointment.status.replace("_", " ")}</span>
              </div>

              <div className="space-y-2 text-sm">
                <Row icon={<Calendar className="size-4" />}>{fmt(detail.appointment.starts_at)} – {new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(detail.appointment.ends_at))}</Row>
                {detail.serviceName && <Row icon={<FileText className="size-4" />}>{detail.serviceName}</Row>}
                {detail.resourceName && <Row icon={<User className="size-4" />}>With {detail.resourceName}</Row>}
                {detail.appointment.customer_phone && <Row icon={<Phone className="size-4" />}><a className="text-primary" href={`tel:${detail.appointment.customer_phone}`}>{detail.appointment.customer_phone}</a></Row>}
                {detail.appointment.customer_email && <Row icon={<Mail className="size-4" />}><a className="text-primary break-all" href={`mailto:${detail.appointment.customer_email}`}>{detail.appointment.customer_email}</a></Row>}
                {detail.appointment.customer_address && <Row icon={<MapPin className="size-4" />}>{detail.appointment.customer_address}</Row>}
                {detail.appointment.notes && <Row icon={<Clock className="size-4" />}>{detail.appointment.notes}</Row>}
                <div className="text-xs text-muted-foreground pt-1">Source: {detail.appointment.source}</div>
              </div>

              {(detail.lead || detail.workOrder) && (
                <div className="flex flex-wrap gap-2">
                  {detail.lead && <a href={`/leads/${detail.lead.id}`} className="inline-flex items-center gap-1 text-sm text-primary"><UserPlus className="size-3.5" /> Lead: {detail.lead.name} <ExternalLink className="size-3" /></a>}
                  {detail.workOrder && <a href={`/work-orders/${detail.workOrder.id}`} className="inline-flex items-center gap-1 text-sm text-primary"><FileText className="size-3.5" /> {detail.workOrder.number ?? "Work order"} ({detail.workOrder.status}) <ExternalLink className="size-3" /></a>}
                </div>
              )}

              {/* actions */}
              {detail.appointment.status !== "cancelled" && (
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {detail.appointment.status !== "completed" && <Button size="sm" variant="outline" disabled={pending} onClick={() => changeStatus(detail.appointment.id, "completed")}>Mark done</Button>}
                  {detail.appointment.status !== "no_show" && <Button size="sm" variant="outline" disabled={pending} onClick={() => changeStatus(detail.appointment.id, "no_show")}>No-show</Button>}
                  <Button size="sm" variant="outline" className="text-rose-600" disabled={pending} onClick={() => changeStatus(detail.appointment.id, "cancelled")}>Cancel</Button>
                  <a href={`/booking/${detail.appointment.manage_token}`} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">Open manage page</Button></a>
                </div>
              )}

              {/* history */}
              {detail.audit.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">History</div>
                  <div className="space-y-1.5">
                    {detail.audit.map((h) => (
                      <div key={h.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-primary/50" />
                        <span className="capitalize font-medium text-foreground">{h.event.replace("_", " ")}</span>
                        <span>· {h.actor}</span>
                        <span className="ml-auto">{new Intl.DateTimeFormat("en-AU", { timeZone: timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(h.created_at))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-start gap-2"><span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span><span className="min-w-0">{children}</span></div>;
}
