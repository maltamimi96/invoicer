import type { Metadata } from "next";
import Link from "next/link";
import { PlanCards } from "@/components/marketing/plan-cards";
import { SOLUTIONS } from "@/lib/marketing/solutions";

export const metadata: Metadata = {
  title: "Pricing — Kirei",
  description: "Plans for trade businesses and for the agencies that run them.",
};

export default function PricingPage() {
  return (
    <div className="space-y-16 pt-12">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Pricing</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Two products, priced for what they are. Cancel whenever — no setup fee, no lock-in.
        </p>
      </section>

      {SOLUTIONS.map((s) => (
        <section key={s.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{s.name}</h2>
              <p className="mt-1 text-muted-foreground">{s.headline}</p>
            </div>
            <Link href={`/${s.slug}`} className="text-sm text-primary hover:underline">
              What&rsquo;s included →
            </Link>
          </div>
          <div className="mt-6"><PlanCards solution={s} /></div>
        </section>
      ))}

      <section className="rounded-3xl border border-border bg-card p-8">
        <h2 className="text-xl font-semibold">Questions before you commit?</h2>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Tell us how you work and we&rsquo;ll tell you honestly whether Kirei fits — including when it doesn&rsquo;t.
        </p>
        <Link href="/contact-sales"
          className="mt-5 inline-block rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
          Contact sales
        </Link>
      </section>
    </div>
  );
}
