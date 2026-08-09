"use client";

import { useState } from "react";
import { Loader2, Check } from "@/components/ui/icons";
import { SOLUTIONS } from "@/lib/marketing/solutions";

export function ContactForm({ defaultSolution }: { defaultSolution?: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/marketing/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fd.entries())),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Something went wrong."); return; }
      setSent(true);
    } catch {
      setError("Couldn't reach us just now — try again, or email us directly.");
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <Check className="h-5 w-5 text-ok" /> Got it.
        </p>
        <p className="mt-2 text-muted-foreground">
          We&rsquo;ll come back to you at the address you gave, usually within a working day.
        </p>
      </div>
    );
  }

  const field = "w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors focus:border-border-strong";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-3xl border border-border bg-card p-6 sm:p-8">
      {/* Honeypot — off-screen, never announced, never tabbed to. */}
      <input name="_hp" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0" />

      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Your name" className={field} />
        <input name="email" type="email" required placeholder="Email" className={field} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="company" placeholder="Company (optional)" className={field} />
        <select name="solution" defaultValue={defaultSolution ?? ""} className={field}>
          <option value="">What are you after?</option>
          {SOLUTIONS.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          <option value="Not sure">Not sure yet</option>
        </select>
      </div>
      <textarea name="message" required rows={5} className={field}
        placeholder="How do you work at the moment, and what's not working about it?" />

      {error && <p className="text-sm text-bad">{error}</p>}

      <button type="submit" disabled={busy}
        className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send
      </button>
    </form>
  );
}
