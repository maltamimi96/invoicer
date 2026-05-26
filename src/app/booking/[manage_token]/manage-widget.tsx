"use client";

/** Customer self-serve view / reschedule / cancel. Inline-styled, standalone. */
import { useCallback, useEffect, useMemo, useState } from "react";

interface Appt { id: string; status: string; starts_at: string; ends_at: string; customer_name: string }
interface ManageData {
  appointment: Appt; slug: string | null; timezone: string;
  appointment_type_id: string | null; cancellation_window_hours: number; can_cancel: boolean;
}
interface Slot { start: string; end: string; resource_id: string; resource_name: string }

const MANAGE = (t: string) => `/api/public/v1/bookings/${encodeURIComponent(t)}`;

function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function ManageWidget({ token }: { token: string }) {
  const [data, setData] = useState<ManageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);

  const accent = "#1f8f86";

  const reload = useCallback(async () => {
    const r = await fetch(MANAGE(token));
    if (!r.ok) { setError("Booking not found."); return; }
    setData(await r.json());
  }, [token]);
  useEffect(() => { reload(); }, [reload]);

  const tzFmt = useMemo(() => data ? new Intl.DateTimeFormat("en-AU", {
    timeZone: data.timezone, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
  }) : null, [data]);

  async function loadSlots() {
    if (!data?.slug || !data.appointment_type_id) { setError("Reschedule isn't available for this booking."); return; }
    setRescheduling(true); setError(null);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone }).format(new Date());
    const r = await fetch(`/api/public/v1/biz/${data.slug}/availability?type=${data.appointment_type_id}&from=${today}&to=${addDays(today, 14)}`);
    const d = await r.json();
    setSlots(d.slots ?? []);
  }

  async function reschedule(s: Slot) {
    setBusy(true); setError(null);
    const r = await fetch(MANAGE(token), {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: s.start, resource_id: s.resource_id }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(d.error || "Couldn't reschedule."); return; }
    setNotice("Your booking has been rescheduled."); setRescheduling(false); reload();
  }

  async function cancel() {
    if (!confirm("Cancel this booking?")) return;
    setBusy(true); setError(null);
    const r = await fetch(MANAGE(token), { method: "DELETE" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(d.error || "Couldn't cancel."); return; }
    setNotice("Your booking has been cancelled."); reload();
  }

  const S = {
    page: { minHeight: "100vh", background: "#f6f7f9", display: "flex", justifyContent: "center", padding: "24px 16px", fontFamily: "system-ui, sans-serif", color: "#0f172a" } as React.CSSProperties,
    card: { width: "100%", maxWidth: 520, background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" } as React.CSSProperties,
    chip: { border: "1px solid #e2e8f0", background: "#fff", borderRadius: 999, padding: "8px 12px", margin: 4, cursor: "pointer", fontSize: 14 } as React.CSSProperties,
    btn: { background: accent, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 600, cursor: "pointer" } as React.CSSProperties,
    danger: { background: "#fff", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 16px", fontWeight: 600, cursor: "pointer" } as React.CSSProperties,
  };

  if (error && !data) return <div style={S.page}><div style={S.card}>{error}</div></div>;
  if (!data) return <div style={S.page}><div style={S.card}>Loading…</div></div>;

  const a = data.appointment;
  const cancelled = a.status === "cancelled";

  return (
    <div style={S.page}>
      <main style={S.card}>
        <h1 style={{ fontSize: 20, marginTop: 0 }}>Your booking</h1>
        <p style={{ color: "#475569" }}>
          <strong style={{ textTransform: "capitalize" }}>{a.status}</strong><br />
          {tzFmt!.format(new Date(a.starts_at))}
        </p>

        {notice && <div style={{ background: "#ecfdf5", color: "#047857", padding: 12, borderRadius: 10, margin: "12px 0" }}>{notice}</div>}
        {error && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 10, margin: "12px 0" }} role="alert">{error}</div>}

        {!cancelled && !rescheduling && (
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={S.btn} disabled={busy} onClick={loadSlots}>Reschedule</button>
            <button style={S.danger} disabled={busy} onClick={cancel}>Cancel booking</button>
          </div>
        )}
        {!cancelled && !data.can_cancel && (
          <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 8 }}>
            Cancellations require at least {data.cancellation_window_hours}h notice.
          </p>
        )}

        {rescheduling && (
          <div style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 16 }}>Pick a new time</h2>
            {slots.length === 0 && <p>No times available.</p>}
            <div style={{ display: "flex", flexWrap: "wrap", margin: -4 }}>
              {slots.map((s) => (
                <button key={s.start} style={S.chip} disabled={busy} onClick={() => reschedule(s)}>
                  {new Intl.DateTimeFormat("en-AU", { timeZone: data.timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(s.start))}
                </button>
              ))}
            </div>
            <button style={{ background: "none", border: "none", color: accent, cursor: "pointer", marginTop: 12, padding: 0 }} onClick={() => setRescheduling(false)}>← Back</button>
          </div>
        )}
      </main>
    </div>
  );
}
