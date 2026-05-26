"use client";

/**
 * Public booking widget — branded, animated, self-contained. Inline styles so
 * it renders identically standalone or inside a cross-site embed iframe.
 * Brand colour + logo + business name pulled from booking-config.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ApptType {
  id: string; name: string; description: string | null;
  duration_minutes: number; price_display: string | null; color: string | null;
}
interface Config {
  enabled: boolean;
  business_name: string | null;
  timezone: string;
  branding: { logo_url: string | null; color: string | null };
  required_fields: { phone: boolean; email: boolean; address: boolean };
  confirmation_message: string | null;
  cancellation_window_hours: number;
  captcha: { provider: "turnstile" | "hcaptcha"; site_key: string | null } | null;
  appointment_types: ApptType[];
}
interface Slot { start: string; end: string; resource_id: string; resource_name: string }
type Step = "type" | "time" | "details" | "done";

const API = (slug: string, path: string) => `/api/public/v1/biz/${encodeURIComponent(slug)}${path}`;
const KIREI_LOGO = "/kirei-logo.png"; // fallback when the business has no logo

function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function shade(hex: string, pct: number) {
  // darken/lighten a #rrggbb by pct (-1..1)
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * pct)));
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return `#${[adj(r), adj(g), adj(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function BookingWidget({ slug }: { slug: string }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<ApptType | null>(null);
  const [selectingType, setSelectingType] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [picking, setPicking] = useState<string | null>(null); // slot.start being held → locks the grid
  const [holdToken, setHoldToken] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "", hp: "" });
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ manage_token: string; message: string | null } | null>(null);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const accent = config?.branding.color || "#1f8f86";
  const accentDark = shade(accent, -0.22);

  useEffect(() => {
    fetch(API(slug, "/booking-config"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("unavailable"))))
      .then((c: Config) => setConfig(c))
      .catch(() => setLoadError("This booking page isn't available."));
  }, [slug]);

  useEffect(() => {
    if (!config?.captcha?.site_key) return;
    const src = config.captcha.provider === "hcaptcha"
      ? "https://js.hcaptcha.com/1/api.js"
      : "https://challenges.cloudflare.com/turnstile/v0/api.js";
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true;
    document.head.appendChild(s);
    (window as unknown as Record<string, unknown>).__kireiCaptcha = (t: string) => setCaptchaToken(t);
  }, [config]);

  // Report height for embeds.
  useEffect(() => {
    const post = () => { try { window.parent?.postMessage({ kireiBookingHeight: document.documentElement.scrollHeight }, "*"); } catch { /* ignore */ } };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [step, slots, config, error, result]);

  const tzFmt = useMemo(() => config ? new Intl.DateTimeFormat("en-AU", { timeZone: config.timezone, weekday: "long", day: "numeric", month: "long" }) : null, [config]);
  const timeFmt = useMemo(() => config ? new Intl.DateTimeFormat("en-AU", { timeZone: config.timezone, hour: "numeric", minute: "2-digit", hour12: true }) : null, [config]);

  const loadSlots = useCallback(async (t: ApptType) => {
    if (!config) return;
    setLoadingSlots(true); setError(null); setSlots([]);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date());
    try {
      const r = await fetch(API(slug, `/availability?type=${t.id}&from=${today}&to=${addDays(today, 21)}`));
      const d = await r.json();
      setSlots(d.slots ?? []);
    } catch { setError("Couldn't load available times."); }
    finally { setLoadingSlots(false); }
  }, [config, slug]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    if (!config) return map;
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone });
    for (const s of slots) {
      const k = dayKey.format(new Date(s.start));
      (map.get(k) ?? map.set(k, []).get(k)!).push(s);
    }
    return map;
  }, [slots, config]);

  async function pickSlot(s: Slot) {
    if (!type || picking) return;            // lock — prevents double-taps / races
    setPicking(s.start); setSlot(s); setError(null);
    try {
      const r = await fetch(API(slug, "/holds"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: type.id, resource_id: s.resource_id, start: s.start }),
      });
      if (r.ok) { const d = await r.json(); setHoldToken(d.hold_token); }
      else { setHoldToken(null); if (r.status === 409) { setError("That time was just taken — pick another."); await loadSlots(type); setPicking(null); return; } }
    } catch { setHoldToken(null); }
    setPicking(null);
    setStep("details");
  }

  async function submit() {
    if (!config || !type || !slot) return;
    setError(null);
    if (!form.name.trim()) return setError("Please enter your name.");
    if (config.required_fields.phone && !form.phone.trim()) return setError("Phone is required.");
    if (config.required_fields.email && !form.email.trim()) return setError("Email is required.");
    if (config.required_fields.address && !form.address.trim()) return setError("Address is required.");
    if (config.captcha?.site_key && !captchaToken) return setError("Please complete the verification.");
    setSubmitting(true);
    try {
      const r = await fetch(API(slug, "/bookings"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({
          hold_token: holdToken ?? undefined, type: type.id, resource_id: slot.resource_id, start: slot.start,
          customer_name: form.name, customer_phone: form.phone || undefined, customer_email: form.email || undefined,
          customer_address: form.address || undefined, notes: form.notes || undefined,
          captcha_token: captchaToken || undefined, company_website: form.hp,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Couldn't complete your booking."); if (r.status === 409) { setStep("time"); loadSlots(type); } return; }
      setResult({ manage_token: d.manage_token, message: d.confirmation_message });
      setStep("done");
    } catch { setError("Network error — please try again."); }
    finally { setSubmitting(false); }
  }

  // ---- styles ----
  const stepIndex = { type: 0, time: 1, details: 2, done: 3 }[step];
  const S = {
    page: { minHeight: "100dvh", background: `linear-gradient(160deg, ${accent} 0%, ${accentDark} 100%)`, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "clamp(14px, 4vw, 32px) clamp(10px, 3vw, 16px)", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#0f172a", position: "relative", overflow: "hidden" } as React.CSSProperties,
    card: { width: "100%", maxWidth: 540, background: "#fff", borderRadius: 22, boxShadow: "0 24px 60px rgba(0,0,0,0.22)", overflow: "hidden", position: "relative", zIndex: 1 } as React.CSSProperties,
    header: { padding: "clamp(20px, 5vw, 26px)", color: "#fff", background: `linear-gradient(135deg, ${accent}, ${accentDark})`, position: "relative", overflow: "hidden" } as React.CSSProperties,
    body: { padding: "clamp(18px, 5vw, 24px)" } as React.CSSProperties,
    tile: { display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left" as const, border: "1px solid #e8eaed", background: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, cursor: "pointer" },
    label: { display: "block", fontSize: 13, fontWeight: 600, margin: "14px 0 6px", color: "#334155" } as React.CSSProperties,
    input: { width: "100%", padding: "12px 14px", border: "1px solid #d7dbe0", borderRadius: 12, fontSize: 15, boxSizing: "border-box" as const, outlineColor: accent },
    btn: { background: accent, color: "#fff", border: "none", borderRadius: 12, padding: "14px 18px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", boxShadow: `0 6px 18px ${accent}55` } as React.CSSProperties,
    link: { background: "none", border: "none", color: accent, cursor: "pointer", fontSize: 14, padding: 0, marginTop: 14, fontWeight: 600 } as React.CSSProperties,
    err: { background: "#fef2f2", color: "#b91c1c", borderRadius: 12, padding: "10px 13px", fontSize: 14, marginTop: 14 } as React.CSSProperties,
  };

  const blob = (style: React.CSSProperties): React.CSSProperties => ({ position: "absolute", borderRadius: "50%", filter: "blur(8px)", opacity: 0.25, background: "#fff", ...style });

  if (loadError) return <div style={S.page}><div style={{ ...S.card, padding: 36, textAlign: "center" }}>{loadError}</div></div>;
  if (!config) return (
    <div style={S.page}>
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        style={{ width: 38, height: 38, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", marginTop: 80 }} />
    </div>
  );

  return (
    <div style={S.page}>
      {/* animated background blobs */}
      <motion.div aria-hidden style={blob({ width: 260, height: 260, top: -60, left: -40 })}
        animate={{ y: [0, 24, 0], x: [0, 14, 0] }} transition={{ repeat: Infinity, duration: 12, ease: "easeInOut" }} />
      <motion.div aria-hidden style={blob({ width: 200, height: 200, bottom: -50, right: -30, opacity: 0.18 })}
        animate={{ y: [0, -20, 0] }} transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }} />

      <motion.main style={S.card} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} aria-label="Online booking">
        {/* Header with logo + business name */}
        <div style={S.header}>
          <div aria-hidden style={{ position: "absolute", inset: 0, opacity: 0.12, backgroundImage: "radial-gradient(circle at 20% 30%, #fff 1.5px, transparent 1.6px)", backgroundSize: "22px 22px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={config.branding.logo_url || KIREI_LOGO} alt={config.business_name || "Kirei"}
                style={{ width: "100%", height: "100%", objectFit: "contain", background: config.branding.logo_url ? "transparent" : "#fff", padding: config.branding.logo_url ? 0 : 4 }} />
            </motion.div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "clamp(18px, 5vw, 21px)", fontWeight: 800, lineHeight: 1.15 }}>{config.business_name || "Book an appointment"}</div>
              <div style={{ opacity: 0.9, fontSize: 13, marginTop: 3 }}>
                {step === "type" && "Choose a service to get started"}
                {step === "time" && (type?.name ?? "Pick a time")}
                {step === "details" && "Just a few details"}
                {step === "done" && "All confirmed 🎉"}
              </div>
            </div>
          </div>
          {/* step progress */}
          <div style={{ display: "flex", gap: 6, marginTop: 18, position: "relative" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
                <motion.div animate={{ width: stepIndex > i ? "100%" : stepIndex === i ? "60%" : "0%" }} transition={{ duration: 0.4 }} style={{ height: "100%", background: "#fff" }} />
              </div>
            ))}
          </div>
        </div>

        <div style={S.body}>
          <AnimatePresence mode="wait">
            {/* STEP 1 — type */}
            {step === "type" && (
              <motion.div key="type" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
                {config.appointment_types.length === 0 && <Empty text="No services available to book yet." />}
                {config.appointment_types.map((t, i) => (
                  <motion.button key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    whileHover={selectingType ? undefined : { y: -2, boxShadow: "0 8px 20px rgba(0,0,0,0.08)", borderColor: accent }} whileTap={{ scale: 0.99 }}
                    disabled={selectingType !== null}
                    style={{ ...S.tile, opacity: selectingType && selectingType !== t.id ? 0.5 : 1, cursor: selectingType ? "default" : "pointer" }}
                    onClick={() => { if (selectingType) return; setSelectingType(t.id); setType(t); setStep("time"); loadSlots(t); }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}1a`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>
                      {t.duration_minutes}<span style={{ fontSize: 10, marginLeft: 1 }}>m</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{t.name}</div>
                      {t.description && <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{t.description}</div>}
                      {t.price_display && <div style={{ fontSize: 13, color: accent, marginTop: 3, fontWeight: 600 }}>{t.price_display}</div>}
                    </div>
                    {selectingType === t.id
                      ? <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${accent}40`, borderTopColor: accent }} />
                      : <span style={{ color: "#cbd5e1", fontSize: 20 }}>›</span>}
                  </motion.button>
                ))}
              </motion.div>
            )}

            {/* STEP 2 — time */}
            {step === "time" && (
              <motion.div key="time" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
                {loadingSlots && <SlotSkeleton />}
                {!loadingSlots && slots.length === 0 && <Empty text="No times available in the next few weeks. Please check back soon." />}
                {!loadingSlots && [...slotsByDay.entries()].map(([day, daySlots]) => (
                  <div key={day} style={{ marginBottom: 18 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: "#0f172a" }}>{tzFmt!.format(new Date(daySlots[0].start))}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {daySlots.map((s) => {
                        const isPicking = picking === s.start;
                        const locked = picking !== null && !isPicking;
                        return (
                          <motion.button key={s.start} whileTap={{ scale: 0.95 }} disabled={picking !== null}
                            onClick={() => pickSlot(s)}
                            style={{
                              border: `1px solid ${isPicking ? accent : "#e2e8f0"}`, background: isPicking ? accent : "#fff",
                              color: isPicking ? "#fff" : "#0f172a", borderRadius: 12, padding: "9px 14px", fontSize: 14,
                              cursor: picking ? "default" : "pointer", opacity: locked ? 0.45 : 1, minWidth: 84, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "opacity .15s",
                            }}>
                            {isPicking && <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.5)", borderTopColor: "#fff" }} />}
                            {timeFmt!.format(new Date(s.start))}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button style={S.link} disabled={picking !== null} onClick={() => { setStep("type"); setSlots([]); setSelectingType(null); }}>← Back to services</button>
              </motion.div>
            )}

            {/* STEP 3 — details */}
            {step === "details" && slot && (
              <motion.div key="details" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
                <div style={{ background: `${accent}10`, border: `1px solid ${accent}33`, borderRadius: 14, padding: 14, fontSize: 14, marginBottom: 6 }}>
                  <strong>{type?.name}</strong><br />
                  <span style={{ color: "#475569" }}>{tzFmt!.format(new Date(slot.start))} · {timeFmt!.format(new Date(slot.start))} · with {slot.resource_name}</span>
                </div>
                <label style={S.label} htmlFor="bk-name">Name *</label>
                <input id="bk-name" style={S.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
                <label style={S.label} htmlFor="bk-phone">Phone {config.required_fields.phone ? "*" : ""}</label>
                <input id="bk-phone" style={S.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" inputMode="tel" />
                <label style={S.label} htmlFor="bk-email">Email {config.required_fields.email ? "*" : ""}</label>
                <input id="bk-email" type="email" style={S.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" inputMode="email" />
                {config.required_fields.address && (<>
                  <label style={S.label} htmlFor="bk-addr">Address *</label>
                  <input id="bk-addr" style={S.input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} autoComplete="street-address" />
                </>)}
                <label style={S.label} htmlFor="bk-notes">Notes</label>
                <textarea id="bk-notes" style={{ ...S.input, minHeight: 72 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.hp} onChange={(e) => setForm({ ...form, hp: e.target.value })} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
                {config.captcha?.site_key && (
                  <div style={{ marginTop: 14 }} className={config.captcha.provider === "hcaptcha" ? "h-captcha" : "cf-turnstile"} data-sitekey={config.captcha.site_key} data-callback="__kireiCaptcha" />
                )}
                {error && <div style={S.err} role="alert">{error}</div>}
                <motion.button whileTap={submitting ? undefined : { scale: 0.98 }} style={{ ...S.btn, marginTop: 18, opacity: submitting ? 0.75 : 1, cursor: submitting ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} disabled={submitting} onClick={submit}>
                  {submitting && <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.45)", borderTopColor: "#fff" }} />}
                  {submitting ? "Booking…" : "Confirm booking"}
                </motion.button>
                <button style={S.link} onClick={() => { setStep("time"); setSlot(null); setHoldToken(null); }}>← Choose a different time</button>
              </motion.div>
            )}

            {/* STEP 4 — done */}
            {step === "done" && result && (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center", padding: "16px 0" }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 12 }}
                  style={{ width: 76, height: 76, borderRadius: "50%", background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 40 }}>✓</motion.div>
                <h2 style={{ margin: "6px 0", fontSize: 22 }}>You're booked!</h2>
                {slot && <p style={{ color: "#475569", fontWeight: 600 }}>{tzFmt!.format(new Date(slot.start))} · {timeFmt!.format(new Date(slot.start))}</p>}
                <p style={{ color: "#475569" }}>{result.message || config.confirmation_message || "We've sent a confirmation to your email and will be in touch."}</p>
                <a href={`/booking/${result.manage_token}`} style={{ ...S.link, display: "inline-block", textDecoration: "none" }}>Manage or cancel this booking</a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ textAlign: "center", padding: "0 0 16px", fontSize: 11, color: "#94a3b8" }}>Powered by Kirei</div>
      </motion.main>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ textAlign: "center", padding: "28px 12px", color: "#64748b", fontSize: 14 }}>{text}</div>;
}
function SlotSkeleton() {
  return (
    <div>
      {[0, 1].map((d) => (
        <div key={d} style={{ marginBottom: 18 }}>
          <div style={{ width: 140, height: 14, borderRadius: 6, background: "#eef1f4", marginBottom: 10 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div key={i} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.08 }}
                style={{ width: 84, height: 36, borderRadius: 12, background: "#eef1f4" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
