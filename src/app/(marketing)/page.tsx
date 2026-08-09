import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check } from "@/components/ui/icons";
import { getUserOrNull } from "@/lib/auth";
import { SOLUTIONS, signupHref } from "@/lib/marketing/solutions";

export const metadata: Metadata = {
  title: "Kirei — software for trade businesses, and the agencies that run them",
  description:
    "Quote, schedule, invoice and get paid. Two hubs: one for trade businesses, one for the agencies that look after them.",
};

export default async function HomePage() {
  // Someone already signed in wants their work, not the sales pitch. This used
  // to be the page's only job; it keeps doing it, just no longer for everyone.
  const user = await getUserOrNull().catch(() => null);
  if (user) redirect("/dashboard");

  return (
    <div className="space-y-24 pt-12">
      <section className="max-w-3xl">
        <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
          Run the work, not the paperwork.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
          Kirei turns a job into a quote, a quote into an invoice, and an invoice into money
          in the bank — and you can ask it to, out loud, instead of clicking.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/trades"
            className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
            I run a trade business <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/agencies"
            className="flex items-center gap-2 rounded-2xl border border-border px-6 py-3.5 text-sm font-medium transition-colors hover:border-border-strong">
            I run an agency <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Two doors, said plainly. The whole point of the split is that a tradie
          never has to look at agency tooling to find their jobs. */}
      <section className="grid gap-4 md:grid-cols-2">
        {SOLUTIONS.map((s) => (
          <div key={s.id} className="flex flex-col rounded-3xl border border-border bg-card p-7">
            <h2 className="text-xl font-semibold">{s.name}</h2>
            <p className="mt-2 text-muted-foreground">{s.headline}</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {s.highlights.slice(0, 3).map((h) => (
                <li key={h.title} className="flex gap-2.5 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                  <span className="text-muted-foreground">{h.title}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={`/${s.slug}`}
                className="rounded-2xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-border-strong">
                See what&rsquo;s in it
              </Link>
              <Link href={signupHref(s)}
                className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
                Start free
              </Link>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { t: "Quote on the spot", b: "Build it from your price list, send a PDF, take a deposit when they accept." },
          { t: "Get paid without chasing", b: "Card or bank, saved cards for retainers, and overdue invoices that remind themselves." },
          { t: "Ask, don't hunt", b: "“What's owing on the Harlow job?” The assistant reads and changes anything you can." },
        ].map((x) => (
          <div key={x.t} className="rounded-3xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold">{x.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{x.b}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-border bg-card p-8 sm:p-12">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Not sure which one?</h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          If you do the work yourself, you want Trades. If you look after other people&rsquo;s trade
          businesses, you want Agencies. If you&rsquo;re somewhere in between, tell us and we&rsquo;ll say which.
        </p>
        <Link href="/contact-sales"
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
          Contact sales <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
