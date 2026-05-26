"use client";

/** Customer self-serve view / reschedule / cancel — branded to match the
 *  booking widget. Centered, animated, with a Kirei CTA footer. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Appt { id: string; status: string; starts_at: string; ends_at: string; customer_name: string }
interface ManageData {
  appointment: Appt; slug: string | null; timezone: string;
  appointment_type_id: string | null; cancellation_window_hours: number; can_cancel: boolean;
  branding: { business_name: string | null; logo_url: string | null; color: string | null };
}
interface Slot { start: string; end: string; resource_id: string; resource_name: string }

const MANAGE = (t: string) => `/api/public/v1/bookings/${encodeURIComponent(t)}`;
function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function shade(hex: string, pct: number) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * pct)));
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return `#${[adj(r), adj(g), adj(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function ManageWidget({ token }: { token: string }) {
  const [data, setData] = useState<ManageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const accent = data?.branding.color || "#1f8f86";
  const accentDark = shade(accent, -0.22);

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
    setRescheduling(true); setError(null); setLoadingSlots(true); setSlots([]);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone }).format(new Date());
    try {
      const r = await fetch(`/api/public/v1/biz/${data.slug}/availability?type=${data.appointment_type_id}&from=${today}&to=${addDays(today, 21)}`);
      const d = await r.json();
      setSlots(d.slots ?? []);
    } finally { setLoadingSlots(false); }
  }

  async function reschedule(s: Slot) {
    if (picking) return;
    setPicking(s.start); setBusy(true); setError(null);
    const r = await fetch(MANAGE(token), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start: s.start, resource_id: s.resource_id }) });
    const d = await r.json();
    setBusy(false); setPicking(null);
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

  const fmtSlot = (iso: string) => new Intl.DateTimeFormat("en-AU", {
    timeZone: data!.timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));

  const page: React.CSSProperties = {
    minHeight: "100dvh", background: `linear-gradient(160deg, ${accent} 0%, ${accentDark} 100%)`,
    display: "flex", justifyContent: "center", alignItems: "center", padding: "clamp(14px, 4vw, 24px) clamp(10px, 3vw, 16px)",
    fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif", color: "#0f172a", position: "relative", overflow: "hidden",
  };
  const card: React.CSSProperties = { width: "100%", maxWidth: 480, background: "#fff", borderRadius: 22, boxShadow: "0 24px 60px rgba(0,0,0,0.22)", overflow: "hidden", position: "relative", zIndex: 1 };
  const blob = (s: React.CSSProperties): React.CSSProperties => ({ position: "absolute", borderRadius: "50%", filter: "blur(8px)", opacity: 0.22, background: "#fff", ...s });
  const chip = (active: boolean): React.CSSProperties => ({ border: `1px solid ${active ? accent : "#e2e8f0"}`, background: active ? accent : "#fff", color: active ? "#fff" : "#0f172a", borderRadius: 12, padding: "9px 14px", fontSize: 14, cursor: picking ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 });

  if (error && !data) {
    return <div style={page}><div style={{ ...card, padding: 36, textAlign: "center" }}>{error}</div></div>;
  }
  if (!data) {
    return <div style={page}><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ width: 38, height: 38, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.35)", borderTopColor: "#fff" }} /></div>;
  }

  const a = data.appointment;
  const cancelled = a.status === "cancelled";
  const bizName = data.branding.business_name || "Your booking";

  return (
    <div style={page}>
      <motion.div aria-hidden style={blob({ width: 240, height: 240, top: -60, left: -40 })} animate={{ y: [0, 22, 0] }} transition={{ repeat: Infinity, duration: 12, ease: "easeInOut" }} />
      <motion.div aria-hidden style={blob({ width: 180, height: 180, bottom: -40, right: -30, opacity: 0.16 })} animate={{ y: [0, -18, 0] }} transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }} />

      <motion.main style={card} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
        {/* header */}
        <div style={{ background: `linear-gradient(135deg, ${accent}, ${accentDark})`, padding: "24px 26px", color: "#fff", position: "relative", overflow: "hidden" }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, opacity: 0.12, backgroundImage: "radial-gradient(circle at 20% 30%, #fff 1.5px, transparent 1.6px)", backgroundSize: "22px 22px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.branding.logo_url || "/kirei-logo.png"} alt={bizName}
                style={{ width: "100%", height: "100%", objectFit: "contain", background: data.branding.logo_url ? "transparent" : "#fff", padding: data.branding.logo_url ? 0 : 4 }} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{bizName}</div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>Manage your booking</div>
            </div>
          </div>
        </div>

        {/* body */}
        <div style={{ padding: 24 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, textTransform: "capitalize", color: cancelled ? "#b91c1c" : accent, background: cancelled ? "#fef2f2" : `${accent}14`, padding: "4px 10px", borderRadius: 999, marginBottom: 10 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: cancelled ? "#b91c1c" : accent }} />{a.status}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>{tzFmt!.format(new Date(a.starts_at))}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Booked under {a.customer_name}</div>

          {notice && <div style={{ background: "#ecfdf5", color: "#047857", padding: 12, borderRadius: 12, marginTop: 16, fontSize: 14 }}>{notice}</div>}
          {error && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 12, marginTop: 16, fontSize: 14 }} role="alert">{error}</div>}

          <AnimatePresence mode="wait">
            {!cancelled && !rescheduling && (
              <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <motion.button whileTap={{ scale: 0.98 }} disabled={busy} onClick={loadSlots}
                  style={{ flex: 1, background: accent, color: "#fff", border: "none", borderRadius: 12, padding: "12px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: `0 6px 16px ${accent}55` }}>Reschedule</motion.button>
                <motion.button whileTap={{ scale: 0.98 }} disabled={busy || !data.can_cancel} onClick={cancel}
                  style={{ flex: 1, background: "#fff", color: data.can_cancel ? "#b91c1c" : "#cbd5e1", border: `1px solid ${data.can_cancel ? "#fecaca" : "#e2e8f0"}`, borderRadius: 12, padding: "12px 16px", fontWeight: 700, fontSize: 14, cursor: data.can_cancel ? "pointer" : "not-allowed" }}>Cancel</motion.button>
              </motion.div>
            )}

            {rescheduling && (
              <motion.div key="resched" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 18 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Pick a new time</div>
                {loadingSlots && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{Array.from({ length: 6 }).map((_, i) => <motion.div key={i} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.08 }} style={{ width: 92, height: 36, borderRadius: 12, background: "#eef1f4" }} />)}</div>}
                {!loadingSlots && slots.length === 0 && <div style={{ fontSize: 14, color: "#64748b", padding: "8px 0" }}>No times available right now.</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {slots.map((s) => (
                    <motion.button key={s.start} whileTap={{ scale: 0.95 }} disabled={picking !== null} onClick={() => reschedule(s)} style={{ ...chip(picking === s.start), opacity: picking && picking !== s.start ? 0.45 : 1 }}>
                      {picking === s.start && <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.5)", borderTopColor: "#fff" }} />}
                      {fmtSlot(s.start)}
                    </motion.button>
                  ))}
                </div>
                <button onClick={() => setRescheduling(false)} disabled={picking !== null} style={{ background: "none", border: "none", color: accent, cursor: "pointer", marginTop: 14, padding: 0, fontWeight: 600, fontSize: 14 }}>← Back</button>
              </motion.div>
            )}
          </AnimatePresence>

          {!cancelled && !data.can_cancel && !rescheduling && (
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>Cancellations require at least {data.cancellation_window_hours}h notice.</p>
          )}
        </div>

        {/* Kirei CTA footer */}
        <a href="https://kireihq.com" target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", borderTop: "1px solid #eceef1", padding: "14px 24px", background: "#fafbfc" }}>
          <div style={{ fontSize: 12, color: "#475569" }}>
            <strong style={{ color: "#0f172a" }}>Run a business?</strong> Take online bookings, quotes & invoices with <span style={{ color: accent, fontWeight: 700 }}>Kirei</span> →
          </div>
        </a>
      </motion.main>
    </div>
  );
}
