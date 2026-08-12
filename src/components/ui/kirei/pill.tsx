/**
 * Kirei status pill — single component covering every status tone the app
 * uses (invoice / quote / lead / work-order / task / generic). Pass the
 * status string verbatim; tone is looked up from the table below.
 *
 * Server-component-safe (no hooks).
 */

export type Tone = "success" | "warn" | "danger" | "info" | "violet" | "neutral";

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

/**
 * One tone, one theme token — the same pairs `.ch-pill` resolves to in
 * globals.css. These were raw Tailwind palette pairs (emerald/amber/rose) with
 * hand-written `dark:` variants, which worked but meant "paid" was emerald
 * here and --ok two components over: the same status, two greens, depending
 * which screen you were on.
 */
const TONE_CLASS: Record<Tone, string> = {
  success: "bg-ok/15       text-ok",
  warn:    "bg-warn/15     text-warn",
  danger:  "bg-bad/15      text-bad",
  info:    "bg-primary/15  text-primary",
  violet:  "bg-accent-2/15 text-accent-2",
  neutral: "bg-muted       text-muted-foreground",
};

/**
 * Solid tone, for the places a status is shown as a shape rather than a pill —
 * the schedule card's left rail, the dispatch board's dot. Same table, so a
 * job that's amber on its card can't be orange on the board.
 */
export const TONE_SOLID: Record<Tone, string> = {
  success: "bg-ok",
  warn:    "bg-warn",
  danger:  "bg-bad",
  info:    "bg-primary",
  violet:  "bg-accent-2",
  neutral: "bg-muted-foreground",
};

/**
 * The tone for a status string — the single source every surface reads.
 * Four separate copies of this mapping used to exist, and they disagreed:
 * `in_progress` was amber here, orange on the schedule, orange-400 on the
 * dispatch dot and amber-100 on the job page, while `draft` was grey here and
 * blue LABELLED "Scheduled" on the schedule.
 */
export function toneOf(status: string | null | undefined): Tone {
  return STATUS_TO_TONE[(status ?? "").toLowerCase()] ?? "neutral";
}

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
