import Link from "next/link";
import { ArrowRight, Check } from "@/components/ui/icons";
import { PlanCards } from "@/components/marketing/plan-cards";
import { signupHref, type Solution } from "@/lib/marketing/solutions";

/** One solution's page. Both /trades and /agencies render this. */
export function SolutionPage({ solution }: { solution: Solution }) {
  return (
    <div className="space-y-20 pt-10">
      <section className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">{solution.name}</p>
        <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          {solution.headline}
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">{solution.subhead}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={signupHref(solution)}
            className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/contact-sales"
            className="rounded-2xl border border-border px-6 py-3.5 text-sm font-medium transition-colors hover:border-border-strong">
            Talk to us first
          </Link>
        </div>

        {/* Saying who it isn't for is the fastest way to help the right person
            self-select — and stops the wrong one signing up and churning. */}
        <p className="mt-6 text-sm text-muted-foreground">{solution.notFor}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {solution.highlights.map((h) => (
          <div key={h.title} className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold">{h.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{h.body}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
        <p className="mt-2 text-muted-foreground">Cancel whenever. No setup fee.</p>
        <div className="mt-6"><PlanCards solution={solution} /></div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-8 sm:p-10">
        <h2 className="text-2xl font-semibold tracking-tight">Ready when you are</h2>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Set up takes a few minutes — your details, your logo, and you can send a quote the same day.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={signupHref(solution)}
            className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/contact-sales"
            className="rounded-2xl border border-border px-6 py-3.5 text-sm font-medium transition-colors hover:border-border-strong">
            Contact sales
          </Link>
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {["No card to start", "Your data stays yours", "Cancel any time"].map((x) => (
            <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-ok" />{x}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
