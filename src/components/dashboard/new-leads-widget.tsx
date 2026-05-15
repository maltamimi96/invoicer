"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { UserPlus, ArrowRight, MapPin } from "@/components/ui/icons";
import { getLeads } from "@/lib/actions/leads";
import { GradientTile, KireiAvatar, AnimatedPress, EmptyState, SkeletonRow } from "@/components/ui/kirei";
import type { Lead } from "@/types/database";

const SOURCE_LABELS: Record<string, string> = {
  "landing-page":   "Landing Page",
  "website":        "Website",
  "referral":       "Referral",
  "telegram":       "Telegram",
  "email":          "Email",
  "phone":          "Phone",
  "manual":         "Manual",
  "hipages":        "HiPages",
  "service-seeking":"ServiceSeeking",
  "google":         "Google",
  "facebook":       "Facebook",
  "instagram":      "Instagram",
  "word-of-mouth":  "Word of mouth",
};

function fmtSource(s: string | null | undefined): string {
  if (!s) return "—";
  return SOURCE_LABELS[s] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Dashboard widget — most recent unconverted leads. */
export function NewLeadsWidget() {
  const [leads, setLeads] = useState<Lead[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await getLeads();
      const filtered = all
        .filter((l) => l.status === "new" || l.status === "contacted")
        .slice(0, 5);
      setLeads(filtered);
    } catch { setLeads([]); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <GradientTile gradient="blue" size={32} radius={8}>
            <UserPlus className="w-4 h-4" />
          </GradientTile>
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              New leads
              {leads && leads.length > 0 && (
                <span className="text-[10px] uppercase tracking-wide font-bold bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200 px-1.5 py-0.5 rounded-full">
                  {leads.length}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">Unconverted opportunities</p>
          </div>
        </div>
        <Link href="/leads" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          All leads <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {leads === null ? (
        <div className="p-2 space-y-1.5">
          <SkeletonRow /><SkeletonRow /><SkeletonRow />
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="w-7 h-7" />}
          gradient="blue"
          title="No new leads"
          hint="Once a lead comes in (manual or via a landing page), it'll appear here."
        />
      ) : (
        <div className="p-2 space-y-1.5">
          {leads.map((lead) => (
            <Link key={lead.id} href={`/leads/${lead.id}`} className="block">
              <AnimatedPress className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/70 hover:border-primary/30 transition-colors">
                <KireiAvatar name={lead.name ?? "?"} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold break-words">{lead.name}</p>
                    {lead.status === "contacted" && (
                      <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">contacted</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                    <span>{fmtSource(lead.source)}</span>
                    {lead.suburb && (
                      <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{lead.suburb}</span>
                    )}
                    <span>· {fmtAge(lead.created_at)}</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
              </AnimatedPress>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
