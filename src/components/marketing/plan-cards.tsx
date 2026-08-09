import Link from "next/link";
import { Check } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import {
  SHOW_PRICES, formatPrice, signupHref, type Solution,
} from "@/lib/marketing/solutions";

/** The tier cards for one solution. Server component — no interactivity. */
export function PlanCards({ solution }: { solution: Solution }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {solution.plans.map((plan) => (
        <div
          key={plan.id}
          className={cn(
            "flex flex-col rounded-3xl border p-6",
            plan.featured ? "border-primary bg-card" : "border-border bg-card/60",
          )}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            {plan.featured && (
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                Most pick this
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

          <p className="mt-5 text-3xl font-semibold tracking-tight">
            {SHOW_PRICES ? formatPrice(plan) : "Let's talk"}
            {SHOW_PRICES && plan.price !== null && (
              <span className="ml-1 text-sm font-normal text-muted-foreground">/month</span>
            )}
          </p>

          <ul className="mt-5 flex-1 space-y-2.5">
            {plan.features.map((f) => (
              <li key={f} className="flex gap-2.5 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>

          <Link
            href={plan.price === null || !SHOW_PRICES ? "/contact-sales" : signupHref(solution)}
            className={cn(
              "mt-6 rounded-2xl px-4 py-3 text-center text-sm font-semibold transition-colors",
              plan.featured
                ? "bg-primary text-primary-foreground hover:brightness-110"
                : "border border-border hover:border-border-strong",
            )}
          >
            {plan.cta ?? (SHOW_PRICES ? "Get started" : "Talk to sales")}
          </Link>
        </div>
      ))}
    </div>
  );
}
