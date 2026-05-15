/**
 * Kirei status pill — single component covering every status tone the app
 * uses (invoice / quote / lead / work-order / task / generic). Pass the
 * status string verbatim; tone is looked up from the table below.
 *
 * Server-component-safe (no hooks).
 */

type Tone = "success" | "warn" | "danger" | "info" | "violet" | "neutral";

const STATUS_TO_TONE: Record<string, Tone> = {
  // Invoices
  paid:        "success",
  pending:     "warn",
  partial:     "info",
  overdue:     "danger",
  draft:       "neutral",
  // Quotes
  accepted:    "success",
  sent:        "info",
  viewed:      "info",
  rejected:    "danger",
  declined:    "danger",
  // Leads
  new:         "info",
  contacted:   "info",
  quoted:      "violet",
  won:         "success",
  lost:        "danger",
  // Work orders
  assigned:    "info",
  in_progress: "warn",
  "in-progress": "warn",
  submitted:   "violet",
  reviewed:    "warn",
  completed:   "success",
  cancelled:   "danger",
  scheduled:   "info",
  // Generic
  active:      "success",
  archived:    "neutral",
};

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  warn:    "bg-amber-100   text-amber-900   dark:bg-amber-900/40   dark:text-amber-200",
  danger:  "bg-rose-100    text-rose-900    dark:bg-rose-900/40    dark:text-rose-200",
  info:    "bg-blue-100    text-blue-900    dark:bg-blue-900/40    dark:text-blue-200",
  violet:  "bg-violet-100  text-violet-900  dark:bg-violet-900/40  dark:text-violet-200",
  neutral: "bg-muted       text-muted-foreground",
};

interface Props {
  tone?: string;
  /** Optional override text. Defaults to humanising the tone key. */
  children?: React.ReactNode;
  className?: string;
}

export function KireiPill({ tone, children, className }: Props) {
  const t = (tone ?? "neutral").toString().toLowerCase();
  const cls = TONE_CLASS[STATUS_TO_TONE[t] ?? "neutral"];
  const label = children ?? humanize(t);
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${cls} ${className ?? ""}`}>
      {label}
    </span>
  );
}

function humanize(s: string): string {
  return s.replace(/[_-]+/g, " ");
}
