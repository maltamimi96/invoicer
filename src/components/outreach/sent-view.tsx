"use client";

/**
 * What the outreach agent actually sent.
 *
 * Every one of these facts was already being recorded — recipient, subject,
 * which step, opens, clicks, bounces, replies — and none of it was visible
 * anywhere in the app. An agent that emails people on your behalf and can't
 * show you what it sent is asking to be trusted on nothing.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, X, MailCheck, MousePointer2, AlertCircle, Send } from "@/components/ui/icons";
import { cn, formatDate } from "@/lib/utils";
import type { SentMessage } from "@/lib/actions/outreach";

/**
 * The furthest state a message reached, and how it reads.
 *
 * Deliberately ordered by what the operator cares about rather than by what
 * happened last: a reply is the point of the whole exercise, so it wins over
 * a click, which wins over an open.
 */
function outcome(m: SentMessage): { label: string; tone: string; icon: typeof Send } {
  if (m.replied_at) return { label: "Replied", tone: "bg-ok/15 text-ok", icon: MailCheck };
  if (m.bounced_at || m.status === "bounced") return { label: "Bounced", tone: "bg-bad/15 text-bad", icon: AlertCircle };
  if (m.status === "failed") return { label: "Failed", tone: "bg-bad/15 text-bad", icon: AlertCircle };
  if (m.clicked_at) return { label: "Clicked", tone: "bg-primary/15 text-primary", icon: MousePointer2 };
  if (m.opened_at) return { label: "Opened", tone: "bg-accent-2/15 text-accent-2", icon: MailCheck };
  return { label: "Sent", tone: "bg-muted text-muted-foreground", icon: Send };
}

const FILTERS = [
  { key: "", label: "Everything" },
  { key: "replied", label: "Replied" },
  { key: "clicked", label: "Clicked" },
  { key: "opened", label: "Opened" },
  { key: "problem", label: "Bounced or failed" },
] as const;

export function SentView({ messages }: { messages: SentMessage[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return messages.filter((m) => {
      if (filter === "replied" && !m.replied_at) return false;
      if (filter === "clicked" && !m.clicked_at) return false;
      if (filter === "opened" && !m.opened_at) return false;
      if (filter === "problem" && !(m.bounced_at || m.status === "bounced" || m.status === "failed")) return false;
      if (!q) return true;
      return [m.recipient, m.subject, m.prospects?.name, m.prospects?.company, m.outreach_campaigns?.name]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [messages, search, filter]);

  // Counted from everything, not the filtered view — a rate that changes when
  // you filter is a rate nobody can trust.
  const stats = useMemo(() => ({
    sent: messages.length,
    opened: messages.filter((m) => m.opened_at).length,
    clicked: messages.filter((m) => m.clicked_at).length,
    replied: messages.filter((m) => m.replied_at).length,
  }), [messages]);

  if (messages.length === 0) {
    return (
      <Card><CardContent className="py-14 text-center">
        <Send className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Nothing sent yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Once a campaign is running, every email it sends shows up here — with whether it
          was opened, clicked or replied to.
        </p>
      </CardContent></Card>
    );
  }

  const pct = (n: number) => (stats.sent ? Math.round((n / stats.sent) * 100) : 0);

  return (
    <div className="space-y-4">
      <div className="ch-stat-grid">
        <div className="ch-stat"><span>Sent</span><strong>{stats.sent}</strong></div>
        <div className="ch-stat"><span>Opened</span><strong>{stats.opened} <span className="text-sm font-normal text-muted-foreground">({pct(stats.opened)}%)</span></strong></div>
        <div className="ch-stat"><span>Clicked</span><strong>{stats.clicked} <span className="text-sm font-normal text-muted-foreground">({pct(stats.clicked)}%)</span></strong></div>
        <div className="ch-stat"><span>Replied</span><strong>{stats.replied} <span className="text-sm font-normal text-muted-foreground">({pct(stats.replied)}%)</span></strong></div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipient, subject, company…" className="pl-9 pr-9"
            aria-label="Search sent emails"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            ><X className="h-3.5 w-3.5" /></button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {visible.length} of {messages.length}
      </p>

      <div className="space-y-2">
        {visible.map((m) => {
          const o = outcome(m);
          const Icon = o.icon;
          return (
            <Card key={m.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", o.tone)}>
                      <Icon className="h-3 w-3" /> {o.label}
                    </span>
                    {m.prospects?.name || m.prospects?.company ? (
                      <Link href={`/prospects/${m.prospects.id}`} className="text-sm font-medium hover:underline break-words">
                        {m.prospects.company || m.prospects.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium break-all">{m.recipient}</span>
                    )}
                    {m.step_order != null && (
                      <span className="text-[11px] text-muted-foreground">step {m.step_order}</span>
                    )}
                  </div>
                  {m.subject && <p className="mt-1 text-sm break-words">{m.subject}</p>}
                  <p className="mt-1 text-xs text-muted-foreground break-all">
                    {m.recipient}
                    {m.outreach_campaigns?.name ? ` · ${m.outreach_campaigns.name}` : ""}
                  </p>
                  {m.error && <p className="mt-1 text-xs text-destructive break-words">{m.error}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(m.sent_at)}</span>
              </CardContent>
            </Card>
          );
        })}
        {visible.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing matches that.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
