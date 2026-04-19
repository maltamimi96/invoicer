"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  LayoutDashboard, FileText, FileCheck, Users, Package, CalendarDays, Repeat,
  UserPlus, ClipboardList, Wrench, MessageSquare, Users2, Bot, Settings, Mic,
  ArrowRight, Sparkles, Zap, Clock, CheckCircle2, Workflow, ChevronDown,
  Mail, Brain, Send, PenLine, DollarSign, Bell, Database, Cpu, MousePointer2,
  Move, RefreshCw, GitBranch, Hammer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const sections = [
  {
    icon: LayoutDashboard, color: "blue", title: "Dashboard", href: "/dashboard",
    summary: "At-a-glance: revenue, jobs in progress, unpaid invoices, today's schedule.",
    steps: ["Open the app — this is your home", "Cards link straight into the relevant module"],
  },
  {
    icon: FileText, color: "emerald", title: "Invoices", href: "/invoices",
    summary: "Create, send, and track invoices. Auto-generates PDFs.",
    steps: [
      "Click New Invoice → pick customer → add line items",
      "Save → preview PDF → send by email or share link",
      "Mark paid manually or wait for reminder cron at 09:00",
    ],
  },
  {
    icon: FileCheck, color: "violet", title: "Quotes", href: "/quotes",
    summary: "Quote work before you do it. Convert to invoice or work order on accept.",
    steps: [
      "New Quote → line items + terms",
      "Send to customer (PDF + share link)",
      "Once accepted: Convert → Invoice or Work Order",
    ],
  },
  {
    icon: Users, color: "sky", title: "Customers", href: "/customers",
    summary: "Single source of truth per customer — every invoice, quote, job, message.",
    steps: [
      "New Customer → contact + billing + site address",
      "Open a customer → Hub tab shows complete history",
      "Sites tab tracks multiple service locations per customer",
    ],
  },
  {
    icon: Package, color: "amber", title: "Products", href: "/products",
    summary: "Reusable line items with default pricing.",
    steps: ["New Product → name, unit price, tax", "Pull into invoices/quotes via the line-item picker"],
  },
  {
    icon: CalendarDays, color: "indigo", title: "Schedule", href: "/schedule",
    summary: "Two views: Week calendar + Dispatch board (workers × days, drag-drop).",
    steps: [
      "Toggle top-right between Week and Dispatch",
      "In Dispatch view: drag a job card to a different worker/day cell",
      "Drop = reschedules date and reassigns workers automatically",
    ],
  },
  {
    icon: Repeat, color: "teal", title: "Recurring Jobs", href: "/recurring",
    summary: "Set up jobs that repeat — daily cron mints upcoming work orders.",
    steps: [
      "New Recurring → cadence (weekly / biweekly / monthly / quarterly)",
      "Set preferred weekday or day-of-month + default workers",
      "Cron at 19:30 UTC creates work orders ahead based on 'generate days ahead'",
      "Pause / Resume / Delete from the card menu anytime",
    ],
  },
  {
    icon: UserPlus, color: "pink", title: "Leads", href: "/leads",
    summary: "Inbound enquiries. Auto-created from emails (IMAP + AI classifier) or added manually.",
    steps: [
      "Configure IMAP in Settings → emails get scanned + classified",
      "Or click New Lead",
      "Card menu → Convert to Customer / Quote / Work Order (creates customer if new)",
    ],
  },
  {
    icon: ClipboardList, color: "orange", title: "Reports", href: "/reports",
    summary: "On-site visit reports with photos.",
    steps: ["Start a report session on-site", "Upload photos + notes per area", "Save → attached to the work order"],
  },
  {
    icon: Wrench, color: "rose", title: "Work Orders", href: "/work-orders",
    summary: "The job itself: assignments, time, materials, photos, signatures, invoicing.",
    steps: [
      "New Work Order → customer, site, line items",
      "Assign workers → they tap in/out for time tracking",
      "Add materials as you go",
      "Capture customer signature via share link",
      "Financials tab → green card → Invoice unbilled time + materials",
    ],
  },
  {
    icon: MessageSquare, color: "cyan", title: "Messages", href: "/messages",
    summary: "SMS threads with customers. Replies thread back automatically.",
    steps: ["Open a customer or thread → reply inline", "Inbound texts land in the same thread"],
  },
  {
    icon: Users2, color: "fuchsia", title: "Team", href: "/team",
    summary: "Invite members, assign roles, view profiles.",
    steps: ["Invite by email", "Assign role (Owner / Admin / Member)", "Member profile = avatar + skills + availability"],
  },
  {
    icon: Bot, color: "purple", title: "Agents", href: "/agents",
    summary: "Per-business catalog of automation agents. Install, configure, toggle.",
    steps: [
      "Browse catalog → Install an agent",
      "Configure its inputs (schedule, triggers, prompts)",
      "Toggle on → Run logs show every execution",
    ],
  },
  {
    icon: Settings, color: "slate", title: "Settings", href: "/settings",
    summary: "Business info, branding, PDF style, IMAP, API keys, webhooks.",
    steps: [
      "Business → name, logo, contact",
      "Appearance → sidebar theme + PDF style",
      "Email → IMAP credentials for lead scanning",
      "Integrations → API keys + outgoing webhooks (Zapier/Make)",
    ],
  },
];

const flows = [
  {
    title: "Lead → Paid Invoice",
    icon: Workflow, color: "emerald",
    steps: [
      "Email lands in IMAP inbox → AI classifier creates a Lead",
      "Open lead → Convert to Quote (customer auto-created)",
      "Send quote → customer accepts",
      "Convert quote → Work Order",
      "Assign workers, schedule on Dispatch board",
      "Workers log time + materials on-site",
      "Capture signature via share link",
      "Financials tab → Invoice unbilled work",
      "Invoice reminder cron chases payment at 09:00",
    ],
  },
  {
    title: "Recurring Maintenance Contract",
    icon: Repeat, color: "teal",
    steps: [
      "Create Customer + site",
      "Recurring → New schedule (e.g. monthly, 1st of month)",
      "Set default workers + duration + 14 days generate-ahead",
      "Cron mints work orders automatically each cycle",
      "Workers see them on the Schedule",
      "Complete + invoice each occurrence as normal",
    ],
  },
  {
    title: "Voice-driven dispatch",
    icon: Mic, color: "violet",
    steps: [
      "Tap mic in top bar",
      "\"Reschedule WO-44 to Friday with Sam\"",
      "Agent calls schedule_work_order tool → updates DB",
      "Dispatch board reflects the change instantly",
    ],
  },
];

// ── Flowcharts ──────────────────────────────────────────────────────────────
type Actor = "user" | "system" | "ai" | "cron" | "customer";
type FlowNode = { icon: LucideIcon; label: string; detail?: string; actor: Actor };

const actorStyle: Record<Actor, { ring: string; bg: string; text: string; chip: string; label: string }> = {
  user:     { ring: "ring-blue-500/40",    bg: "bg-blue-500/10",    text: "text-blue-500",    chip: "bg-blue-500/15 text-blue-400",       label: "You" },
  system:   { ring: "ring-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-500", chip: "bg-emerald-500/15 text-emerald-400", label: "App" },
  ai:       { ring: "ring-violet-500/40",  bg: "bg-violet-500/10",  text: "text-violet-500",  chip: "bg-violet-500/15 text-violet-400",   label: "AI" },
  cron:     { ring: "ring-sky-500/40",     bg: "bg-sky-500/10",     text: "text-sky-500",     chip: "bg-sky-500/15 text-sky-400",         label: "Cron" },
  customer: { ring: "ring-amber-500/40",   bg: "bg-amber-500/10",   text: "text-amber-500",   chip: "bg-amber-500/15 text-amber-400",     label: "Customer" },
};

const flowcharts: { title: string; desc: string; nodes: FlowNode[] }[] = [
  {
    title: "Lead → Paid Invoice (full pipeline)",
    desc: "The complete service business loop, top to bottom.",
    nodes: [
      { actor: "customer", icon: Mail,        label: "Customer emails enquiry",    detail: "Lands in your IMAP inbox" },
      { actor: "cron",     icon: RefreshCw,   label: "Email scanner cron",          detail: "Polls inbox + extracts new messages" },
      { actor: "ai",       icon: Brain,       label: "AI classifier",               detail: "Tags as lead → extracts name, address, job" },
      { actor: "system",   icon: UserPlus,    label: "Lead created",                detail: "Appears in /leads" },
      { actor: "user",     icon: MousePointer2,label: "Convert lead → Quote",       detail: "Customer auto-created if new" },
      { actor: "system",   icon: FileCheck,   label: "Quote drafted",               detail: "PDF generated, share link minted" },
      { actor: "user",     icon: Send,        label: "Send quote to customer",      detail: "Email + share link" },
      { actor: "customer", icon: CheckCircle2,label: "Customer accepts" },
      { actor: "user",     icon: Workflow,    label: "Convert quote → Work Order",  detail: "Or do it via voice" },
      { actor: "user",     icon: CalendarDays,label: "Assign workers + schedule",   detail: "Dispatch board drag-drop" },
      { actor: "user",     icon: Hammer,      label: "Workers log time + materials",detail: "On-site, via mobile" },
      { actor: "customer", icon: PenLine,     label: "Customer signs on completion",detail: "Via share link signature pad" },
      { actor: "user",     icon: DollarSign,  label: "Invoice unbilled work",       detail: "Green CTA → mints invoice" },
      { actor: "cron",     icon: Bell,        label: "Reminder cron 09:00",         detail: "Chases unpaid invoices automatically" },
      { actor: "customer", icon: CheckCircle2,label: "Payment received → marked paid" },
    ],
  },
  {
    title: "Recurring job cycle",
    desc: "Set once, runs forever. Cron mints work orders ahead of time.",
    nodes: [
      { actor: "user",   icon: Repeat,      label: "Create recurring schedule", detail: "Cadence + workers + duration" },
      { actor: "cron",   icon: Clock,       label: "Cron 19:30 UTC daily" },
      { actor: "system", icon: GitBranch,   label: "Check next_occurrence_at",  detail: "Within generate_days_ahead window?" },
      { actor: "system", icon: Wrench,      label: "Mint Work Order",           detail: "Linked back to recurring_job_id" },
      { actor: "system", icon: RefreshCw,   label: "Advance next_occurrence_at",detail: "+7d / +14d / +1mo / +3mo" },
      { actor: "user",   icon: CalendarDays,label: "WO appears on Schedule" },
      { actor: "user",   icon: DollarSign,  label: "Complete + invoice as normal" },
      { actor: "system", icon: RefreshCw,   label: "Loop repeats next cycle" },
    ],
  },
  {
    title: "Voice / AI command",
    desc: "Every action in the UI is also a tool the agent can call.",
    nodes: [
      { actor: "user",   icon: Mic,        label: "Tap mic / type command",     detail: "\"Invoice WO-22 at $95/hr\"" },
      { actor: "ai",     icon: Cpu,        label: "Agent (Claude) parses",       detail: "Picks the right tool from registry" },
      { actor: "ai",     icon: Bot,        label: "Calls server action",         detail: "Same code the UI uses" },
      { actor: "system", icon: Database,   label: "DB updated + revalidatePath" },
      { actor: "ai",     icon: Send,       label: "Result returned to user",     detail: "With link to the new record" },
      { actor: "user",   icon: CheckCircle2,label: "UI auto-refreshes" },
    ],
  },
  {
    title: "Dispatch drag-drop reschedule",
    desc: "Two interactions, one server action.",
    nodes: [
      { actor: "user",   icon: LayoutDashboard,label: "Open Schedule → Dispatch view" },
      { actor: "user",   icon: Move,           label: "Drag job card to new cell",   detail: "Different worker / day" },
      { actor: "system", icon: Cpu,            label: "handleDrop fires",            detail: "Computes new date + assignees" },
      { actor: "system", icon: Database,       label: "rescheduleJob server action", detail: "Updates date + setJobAssignments" },
      { actor: "system", icon: RefreshCw,      label: "revalidatePath /schedule",     detail: "Grid re-renders" },
      { actor: "user",   icon: CheckCircle2,   label: "Card now in new cell" },
    ],
  },
];

const aiExamples = [
  "Create an invoice for John Smith, $450 for gutter cleaning",
  "Reschedule work order 44 to Friday with Sam",
  "Convert lead 12 to a quote for $800",
  "Pause the weekly recurring job for Acme Corp",
  "Show me unpaid invoices over 30 days",
  "Invoice the unbilled time on WO-22 at $95/hr",
  "What's on the schedule tomorrow?",
  "Create a recurring monthly job for Acme — first Monday, 2 hours, Sam + Jess",
];

const crons = [
  { time: "07:00", job: "Daily digest", desc: "Morning summary email" },
  { time: "09:00", job: "Invoice reminders", desc: "Chase unpaid invoices" },
  { time: "10:00", job: "Quote follow-up", desc: "Nudge pending quotes" },
  { time: "Every 4h", job: "Work order completion sweep", desc: "Auto-flag completable WOs" },
  { time: "19:30", job: "Recurring job generation", desc: "Mint upcoming WOs from schedules" },
  { time: "20:00", job: "General reminders", desc: "Customer-facing reminders" },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  emerald: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
  violet: "bg-violet-500/10 text-violet-500 ring-violet-500/20",
  sky: "bg-sky-500/10 text-sky-500 ring-sky-500/20",
  amber: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  indigo: "bg-indigo-500/10 text-indigo-500 ring-indigo-500/20",
  teal: "bg-teal-500/10 text-teal-500 ring-teal-500/20",
  pink: "bg-pink-500/10 text-pink-500 ring-pink-500/20",
  orange: "bg-orange-500/10 text-orange-500 ring-orange-500/20",
  rose: "bg-rose-500/10 text-rose-500 ring-rose-500/20",
  cyan: "bg-cyan-500/10 text-cyan-500 ring-cyan-500/20",
  fuchsia: "bg-fuchsia-500/10 text-fuchsia-500 ring-fuchsia-500/20",
  purple: "bg-purple-500/10 text-purple-500 ring-purple-500/20",
  slate: "bg-slate-500/10 text-slate-500 ring-slate-500/20",
};

export function HelpClient() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-10">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Help & feature guide</h1>
            <p className="text-sm text-muted-foreground">Everything Invoicer can do, and how to drive it — by click or by voice.</p>
          </div>
        </div>
      </motion.div>

      {/* AI section */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <Card className="p-6 border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 ring-1 ring-violet-500/30 flex items-center justify-center flex-shrink-0">
              <Mic className="w-5 h-5 text-violet-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                AI command bar
                <Badge variant="secondary" className="bg-violet-500/10 text-violet-600 dark:text-violet-300">Killer feature</Badge>
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Tap the mic or type — the agent runs the same actions the UI does.</p>
              <div className="mt-4 grid sm:grid-cols-2 gap-2">
                {aiExamples.map((ex) => (
                  <div key={ex} className="text-xs px-3 py-2 rounded-lg bg-background/60 border border-violet-500/15 text-foreground/80">
                    &ldquo;{ex}&rdquo;
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </motion.section>

      {/* Flowcharts */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Workflow className="w-5 h-5 text-fuchsia-500" />
          <h2 className="text-xl font-semibold">Process flow charts</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Lanes:</span>
          {(Object.keys(actorStyle) as Actor[]).map((a) => (
            <span key={a} className={`px-2 py-1 rounded-md font-medium ${actorStyle[a].chip}`}>
              {actorStyle[a].label}
            </span>
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-5">
          {flowcharts.map((fc, fi) => (
            <motion.div
              key={fc.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.04 * fi }}
            >
              <Card className="p-5 h-full">
                <div className="mb-4">
                  <h3 className="font-semibold">{fc.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{fc.desc}</p>
                </div>
                <div className="flex flex-col items-stretch">
                  {fc.nodes.map((n, i) => {
                    const s = actorStyle[n.actor];
                    return (
                      <div key={i} className="flex flex-col items-center">
                        <div className={`w-full flex items-start gap-3 rounded-xl border ${s.ring} ring-1 ${s.bg} p-3`}>
                          <div className={`w-8 h-8 rounded-lg bg-background/60 flex items-center justify-center flex-shrink-0 ${s.text}`}>
                            <n.icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{n.label}</span>
                              <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${s.chip}`}>
                                {s.label}
                              </span>
                            </div>
                            {n.detail && (
                              <p className="text-xs text-muted-foreground mt-0.5">{n.detail}</p>
                            )}
                          </div>
                        </div>
                        {i < fc.nodes.length - 1 && (
                          <div className="flex flex-col items-center py-1">
                            <div className="w-px h-3 bg-border" />
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 -my-1" />
                            <div className="w-px h-3 bg-border" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* End-to-end flows */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-semibold">End-to-end flows</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {flows.map((flow, i) => (
            <motion.div
              key={flow.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * i }}
            >
              <Card className="p-5 h-full">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-lg ring-1 flex items-center justify-center ${colorMap[flow.color]}`}>
                    <flow.icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-sm">{flow.title}</h3>
                </div>
                <ol className="space-y-2">
                  {flow.steps.map((s, j) => (
                    <li key={j} className="flex gap-2 text-xs text-foreground/75">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-muted text-[10px] font-semibold flex items-center justify-center text-muted-foreground">
                        {j + 1}
                      </span>
                      <span className="leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <h2 className="text-xl font-semibold">Every module</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {sections.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.02 * i }}
            >
              <Card className="p-5 h-full hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl ring-1 flex items-center justify-center flex-shrink-0 ${colorMap[s.color]}`}>
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{s.title}</h3>
                      <Link
                        href={s.href}
                        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      >
                        Open <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{s.summary}</p>
                    <ul className="mt-3 space-y-1.5">
                      {s.steps.map((step, j) => (
                        <li key={j} className="text-xs text-foreground/75 flex gap-2">
                          <span className="text-muted-foreground/50 mt-0.5">→</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Crons */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-sky-500" />
          <h2 className="text-xl font-semibold">Background jobs running for you</h2>
        </div>
        <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">When</th>
                <th className="text-left px-4 py-2.5 font-semibold">Job</th>
                <th className="text-left px-4 py-2.5 font-semibold">What it does</th>
              </tr>
            </thead>
            <tbody>
              {crons.map((c) => (
                <tr key={c.job} className="border-t border-border/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-sky-500">{c.time}</td>
                  <td className="px-4 py-2.5 font-medium">{c.job}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </Card>
      </section>

      {/* Footer hint */}
      <div className="text-center text-xs text-muted-foreground py-4">
        Stuck? Tap the mic and just describe what you want — the agent will figure out the right tool.
      </div>
    </div>
  );
}
