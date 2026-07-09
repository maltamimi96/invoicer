"use client";

import { useState } from "react";

interface Props { slug: string; businessName: string; logoUrl: string | null }

export function AuditLandingForm({ slug, businessName, logoUrl }: Props) {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [hp, setHp] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url.trim() || !email.trim()) { setError("Enter your website and email."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/audit/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, email, name, _hp: hp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-emerald-50/40 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt={businessName} className="h-10 mx-auto mb-3" />
            : <p className="text-lg font-bold text-emerald-700">{businessName}</p>}
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Free SEO audit</h1>
          <p className="text-sm text-slate-500 mt-1">Get a free report on your site&apos;s SEO health — delivered to your inbox.</p>
        </div>

        {done ? (
          <div className="rounded-xl border border-emerald-200 bg-white p-6 text-center">
            <p className="font-semibold text-slate-900">You&apos;re all set ✓</p>
            <p className="text-sm text-slate-500 mt-1">Your SEO audit for <strong>{url}</strong> is on its way to {email}. Keep an eye on your inbox.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6 space-y-3 shadow-sm">
            <input type="text" value={hp} onChange={(e) => setHp(e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
            <div>
              <label className="text-xs font-medium text-slate-600">Your website</label>
              <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" className="mt-1 w-full h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="mt-1 w-full h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Name (optional)</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full h-10 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
              {submitting ? "Sending…" : "Get my free audit"}
            </button>
            <p className="text-[11px] text-slate-400 text-center">We&apos;ll email your report. No spam.</p>
          </form>
        )}
        <p className="text-center text-[11px] text-slate-400 mt-4">Powered by {businessName}</p>
      </div>
    </div>
  );
}
