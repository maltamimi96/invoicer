"use client";

/**
 * Self-contained public booking widget. Inline styles only so it renders
 * identically standalone or inside a cross-site embed iframe, independent of
 * any host CSS. Themed by the business's brand color. Accessible + responsive.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function BookingWidget({ slug }: { slug: string }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<ApptType | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [holdToken, setHoldToken] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "", hp: "" });
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ manage_token: string; message: string | null } | null>(null);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const accent = config?.branding.color || "#1f8f86";

  // Load config.
  useEffect(() => {
    fetch(API(slug, "/booking-config"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("unavailable"))))
      .then((c: Config) => setConfig(c))
      .catch(() => setLoadError("This booking page isn't available."));
  }, [slug]);

  // Inject CAPTCHA script if configured.
  useEffect(() => {
    if (!config?.captcha?.site_key) return;
    const src = config.captcha.provider === "hcaptcha"
      ? "https://js.hcaptcha.com/1/api.js"
      : "https://challenges.cloudflare.com/turnstile/v0/api.js";
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true;
    document.head.appendChild(s);
    // Turnstile/hCaptcha call a global callback; expose one.
    (window as unknown as Record<string, unknown>).__kireiCaptcha = (t: string) => setCaptchaToken(t);
  }, [config]);

  // When embedded, report our height to the parent so the iframe auto-grows.
  useEffect(() => {
    const post = () => {
      try {
        const h = document.documentElement.scrollHeight;
        window.parent?.postMessage({ kireiBookingHeight: h }, "*");
      } catch { /* cross-origin parent without listener — ignore */ }
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [step, slots, config, error, result]);

  const tzFmt = useMemo(() => config ? new Intl.DateTimeFormat("en-AU", {
    timeZone: config.timezone, weekday: "short", day: "numeric", month: "short",
  }) : null, [config]);
  const timeFmt = useMemo(() => config ? new Intl.DateTimeFormat("en-AU", {
    timeZone: config.timezone, hour: "numeric", minute: "2-digit", hour12: true,
  }) : null, [config]);

  // Load availability when a type is chosen.
  const loadSlots = useCallback(async (t: ApptType) => {
    if (!config) return;
    setLoadingSlots(true); setError(null);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date());
    try {
      const r = await fetch(API(slug, `/availability?type=${t.id}&from=${today}&to=${addDays(today, 14)}`));
      const d = await r.json();
      setSlots(d.slots ?? []);
    } catch {
      setError("Couldn't load available times.");
    } finally {
      setLoadingSlots(false);
    }
  }, [config, slug]);

  // Group slots by local date.
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
    if (!type) return;
    setSlot(s); setError(null);
    // Create a 10-minute hold so the slot can't be taken while filling the form.
    try {
      const r = await fetch(API(slug, "/holds"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: type.id, resource_id: s.resource_id, start: s.start }),
      });
      if (r.ok) { const d = await r.json(); setHoldToken(d.hold_token); }
      else setHoldToken(null); // fall back to direct booking
    } catch { setHoldToken(null); }
    setStep("details");
  }

  async function submit() {
    if (!config || !type || !slot) return;
    setError(null);
    if (config.required_fields.phone && !form.phone.trim()) return setError("Phone is required.");
    if (config.required_fields.email && !form.email.trim()) return setError("Email is required.");
    if (config.required_fields.address && !form.address.trim()) return setError("Address is required.");
    if (!form.name.trim()) return setError("Please enter your name.");
    if (config.captcha?.site_key && !captchaToken) return setError("Please complete the verification.");

    setSubmitting(true);
    try {
      const r = await fetch(API(slug, "/bookings"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({
          hold_token: holdToken ?? undefined,
          type: type.id, resource_id: slot.resource_id, start: slot.start,
          customer_name: form.name, customer_phone: form.phone || undefined,
          customer_email: form.email || undefined, customer_address: form.address || undefined,
          notes: form.notes || undefined, captcha_token: captchaToken || undefined,
          company_website: form.hp, // honeypot
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Couldn't complete your booking.");
        // If the slot was taken, send them back to pick again.
        if (r.status === 409) { setStep("time"); if (type) loadSlots(type); }
        return;
      }
      setResult({ manage_token: d.manage_token, message: d.confirmation_message });
      setStep("done");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---- styles ----
  const S = {
    page: { minHeight: "100vh", background: "#f6f7f9", display: "flex", justifyContent: "center", padding: "24px 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#0f172a" } as React.CSSProperties,
    card: { width: "100%", maxWidth: 560, background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)", overflow: "hidden" } as React.CSSProperties,
    header: { background: accent, color: "#fff", padding: "20px 24px" } as React.CSSProperties,
    body: { padding: 24 } as React.CSSProperties,
    tile: (active: boolean) => ({ display: "block", width: "100%", textAlign: "left" as const, border: `1px solid ${active ? accent : "#e2e8f0"}`, background: active ? `${accent}10` : "#fff", borderRadius: 12, padding: 14, marginBottom: 10, cursor: "pointer" }),
    chip: (active: boolean) => ({ border: `1px solid ${active ? accent : "#e2e8f0"}`, background: active ? accent : "#fff", color: active ? "#fff" : "#0f172a", borderRadius: 999, padding: "8px 12px", margin: 4, cursor: "pointer", fontSize: 14 }),
    label: { display: "block", fontSize: 13, fontWeight: 600, margin: "12px 0 4px" } as React.CSSProperties,
    input: { width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 15, boxSizing: "border-box" as const },
    btn: { background: accent, color: "#fff", border: "none", borderRadius: 10, padding: "12px 18px", fontSize: 15, fontWeight: 600, cursor: "pointer", width: "100%" } as React.CSSProperties,
    link: { background: "none", border: "none", color: accent, cursor: "pointer", fontSize: 14, padding: 0, marginTop: 12 } as React.CSSProperties,
    err: { background: "#fef2f2", color: "#b91c1c", borderRadius: 10, padding: "10px 12px", fontSize: 14, marginTop: 12 } as React.CSSProperties,
  };

  if (loadError) return <div style={S.page}><div style={{ ...S.card, padding: 32, textAlign: "center" }}>{loadError}</div></div>;
  if (!config) return <div style={S.page}><div style={{ ...S.card, padding: 32, textAlign: "center" }}>Loading…</div></div>;

  return (
    <div style={S.page}>
      <main style={S.card} aria-label="Online booking">
        <div style={S.header}>
          {config.branding.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.branding.logo_url} alt="" style={{ height: 32, marginBottom: 8 }} />
          )}
          <div style={{ fontSize: 20, fontWeight: 700 }}>{config.business_name || "Book an appointment"}</div>
          <div style={{ opacity: 0.85, fontSize: 13, marginTop: 2 }}>
            {step === "type" && "Choose a service"}
            {step === "time" && type?.name}
            {step === "details" && "Your details"}
            {step === "done" && "Confirmed"}
          </div>
        </div>

        <div style={S.body}>
          {/* STEP 1 — type */}
          {step === "type" && (
            <div>
              {config.appointment_types.length === 0 && <p>No services available to book right now.</p>}
              {config.appointment_types.map((t) => (
                <button key={t.id} style={S.tile(false)} onClick={() => { setType(t); setStep("time"); loadSlots(t); }}>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  {t.description && <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{t.description}</div>}
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                    {t.duration_minutes} min{t.price_display ? ` · ${t.price_display}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* STEP 2 — time */}
          {step === "time" && (
            <div>
              {loadingSlots && <p>Loading available times…</p>}
              {!loadingSlots && slots.length === 0 && <p>No times available in the next two weeks.</p>}
              {!loadingSlots && [...slotsByDay.entries()].map(([day, daySlots]) => (
                <div key={day} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                    {tzFmt!.format(new Date(daySlots[0].start))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", margin: -4 }}>
                    {daySlots.map((s) => (
                      <button key={s.start} style={S.chip(false)} onClick={() => pickSlot(s)}>
                        {timeFmt!.format(new Date(s.start))}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button style={S.link} onClick={() => { setStep("type"); setSlots([]); }}>← Back to services</button>
            </div>
          )}

          {/* STEP 3 — details */}
          {step === "details" && slot && (
            <div>
              <div style={{ background: "#f1f5f9", borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 8 }}>
                <strong>{type?.name}</strong><br />
                {tzFmt!.format(new Date(slot.start))}, {timeFmt!.format(new Date(slot.start))} · with {slot.resource_name}
              </div>
              <label style={S.label} htmlFor="bk-name">Name *</label>
              <input id="bk-name" style={S.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
              {config.required_fields.phone !== undefined && (
                <>
                  <label style={S.label} htmlFor="bk-phone">Phone {config.required_fields.phone ? "*" : ""}</label>
                  <input id="bk-phone" style={S.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" inputMode="tel" />
                </>
              )}
              <label style={S.label} htmlFor="bk-email">Email {config.required_fields.email ? "*" : ""}</label>
              <input id="bk-email" type="email" style={S.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" inputMode="email" />
              {config.required_fields.address && (
                <>
                  <label style={S.label} htmlFor="bk-addr">Address *</label>
                  <input id="bk-addr" style={S.input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} autoComplete="street-address" />
                </>
              )}
              <label style={S.label} htmlFor="bk-notes">Notes</label>
              <textarea id="bk-notes" style={{ ...S.input, minHeight: 70 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

              {/* Honeypot — hidden from humans */}
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.hp}
                onChange={(e) => setForm({ ...form, hp: e.target.value })}
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

              {config.captcha?.site_key && (
                <div style={{ marginTop: 12 }}
                  className={config.captcha.provider === "hcaptcha" ? "h-captcha" : "cf-turnstile"}
                  data-sitekey={config.captcha.site_key} data-callback="__kireiCaptcha" />
              )}

              {error && <div style={S.err} role="alert">{error}</div>}
              <button style={{ ...S.btn, marginTop: 16, opacity: submitting ? 0.7 : 1 }} disabled={submitting} onClick={submit}>
                {submitting ? "Booking…" : "Confirm booking"}
              </button>
              <button style={S.link} onClick={() => { setStep("time"); setSlot(null); setHoldToken(null); }}>← Choose a different time</button>
            </div>
          )}

          {/* STEP 4 — done */}
          {step === "done" && result && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 44 }}>✓</div>
              <h2 style={{ margin: "8px 0" }}>You're booked!</h2>
              {slot && <p style={{ color: "#475569" }}>{tzFmt!.format(new Date(slot.start))}, {timeFmt!.format(new Date(slot.start))}</p>}
              <p style={{ color: "#475569" }}>{result.message || config.confirmation_message || "We've received your booking and will be in touch."}</p>
              <a href={`/booking/${result.manage_token}`} style={{ ...S.link, display: "inline-block", textDecoration: "none" }}>
                Manage or cancel this booking
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
