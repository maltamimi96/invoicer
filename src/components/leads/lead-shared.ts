/**
 * Shared vocabulary for the leads workspace.
 *
 * Board, List and Calendar all need the same stage colours, source labels and
 * date formatting. Keeping them here means a stage's colour is defined once —
 * previously the board had a `COLUMNS` map, a `STATUS_BADGE` map and a
 * `CARD_TONE` map that each encoded the same five stages separately.
 */

import type { LeadStatus } from "@/types/database";

export interface StageDef {
  status: LeadStatus;
  label: string;
  /** Solid dot / left-rail colour. */
  dot: string;
  /** Soft tint for pills and column headers. */
  soft: string;
  /** Left-rail border colour for cards. */
  rail: string;
  /** Soft card background tint per status. */
  cardBg: string;
}

export const STAGES: StageDef[] = [
  { status: "new",       label: "New",       dot: "bg-blue-500",    soft: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",          rail: "border-l-blue-500",    cardBg: "bg-blue-50/70 dark:bg-blue-950/20" },
  { status: "contacted", label: "Contacted", dot: "bg-amber-500",   soft: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",      rail: "border-l-amber-500",   cardBg: "bg-amber-50/70 dark:bg-amber-950/20" },
  { status: "quoted",    label: "Quoted",    dot: "bg-violet-500",  soft: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",  rail: "border-l-violet-500",  cardBg: "bg-violet-50/70 dark:bg-violet-950/20" },
  { status: "won",       label: "Won",       dot: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", rail: "border-l-emerald-500", cardBg: "bg-emerald-50/70 dark:bg-emerald-950/20" },
  { status: "lost",      label: "Lost",      dot: "bg-rose-500",    soft: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",          rail: "border-l-rose-500",    cardBg: "bg-rose-50/70 dark:bg-rose-950/20" },
];

export const STAGE_BY_STATUS: Record<LeadStatus, StageDef> = Object.fromEntries(
  STAGES.map((s) => [s.status, s])
) as Record<LeadStatus, StageDef>;

/** The one-click "advance" target for each stage. Won/lost are terminal. */
export const NEXT_STATUS: Partial<Record<LeadStatus, LeadStatus>> = {
  new: "contacted",
  contacted: "quoted",
  quoted: "won",
};

/** Friendly labels for known sources. Anything else is title-cased. */
const SOURCE_LABELS: Record<string, string> = {
  "landing-page": "Landing Page",
  "website": "Website",
  "referral": "Referral",
  "telegram": "Telegram",
  "email": "Email",
  "phone": "Phone",
  "manual": "Manual",
  "hipages": "HiPages",
  "service-seeking": "ServiceSeeking",
  "google": "Google",
  "facebook": "Facebook",
  "instagram": "Instagram",
  "word-of-mouth": "Word of mouth",
};

export function formatSourceLabel(s: string): string {
  return SOURCE_LABELS[s] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** Local Y-M-D. Not toISOString — that shifts to UTC and can land a lead on
 *  the wrong calendar day for anyone away from Greenwich. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type ConvertTarget = "customer" | "quote" | "work_order";

/** Everything a view needs to act on a lead, passed down from the orchestrator. */
export interface LeadActionHandlers {
  onMove: (id: string, status: LeadStatus) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string, target: ConvertTarget) => void;
  onAddAsContact: (id: string) => void;
  /** Open the lead's side drawer (details + tags + notes). */
  onOpen: (id: string) => void;
}
