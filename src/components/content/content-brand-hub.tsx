"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Search, FileText, Activity, Megaphone, Sparkles, Loader2, Calendar as CalendarIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { PLATFORMS, type ContentKind } from "@/lib/content/pipeline";
import { scanTopics, startContentPiece } from "@/lib/actions/content";
import { ContentActivityTerminal } from "./content-activity-terminal";
import { ContentVoiceEditor } from "./content-voice-editor";
import { ContentCampaignsView } from "./content-campaigns-view";
import { ContentCalendar } from "./content-calendar";
import type { CalendarEntry } from "@/lib/actions/content-campaigns";
import type { ContentBrand, ContentTopic, ContentPiece, ContentCampaign } from "@/types/database";

type Tab = "topics" | "pieces" | "campaigns" | "calendar" | "voice" | "activity";

const KINDS: Array<{ id: ContentKind; label: string; blurb: string }> = [
  { id: "script", label: "Video script", blurb: "Hook, beats, VO, on-screen text, CTA." },
  { id: "post", label: "Post + caption", blurb: "Body, caption, hashtags, first comment." },
  { id: "hooks", label: "Hooks pack", blurb: "Just the openers. No platforms needed." },
];

export function ContentBrandHub({
  brand,
  topics,
  pieces,
  campaigns,
  calendar,
  calendarMonth,
  budget,
  scoutBusy,
}: {
  brand: ContentBrand;
  topics: ContentTopic[];
  pieces: ContentPiece[];
  campaigns: ContentCampaign[];
  calendar: CalendarEntry[];
  /** The month the server fetched, as [year, monthIndex]. */
  calendarMonth: [number, number];
  budget: { spentCents: number; budgetCents: number };
  scoutBusy: boolean;
}) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  // URL-synced, unlike the SEO hub — so a tab survives a refresh and can be
  // linked to.
  const tab = (params.get("tab") as Tab) ?? "topics";
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false });

  // The calendar's month lives in the URL too: the entries are fetched on the
  // server, so paging months has to round-trip rather than filter client-side.
  const setMonth = (year: number, month: number) =>
    router.replace(`${pathname}?tab=calendar&m=${year}-${String(month + 1).padStart(2, "0")}`, {
      scroll: false,
    });

  const [topic, setTopic] = useState("");
  const [topicId, setTopicId] = useState<string | null>(null);
  const [kind, setKind] = useState<ContentKind>("script");
  const [platforms, setPlatforms] = useState<string[]>(["instagram", "tiktok"]);
  const [angles, setAngles] = useState(3);
  // The scout takes minutes, so the button has to stay honest about it.
  const [scouting, setScouting] = useState(scoutBusy);

  // Pieces mid-run: poll so the board doesn't look stuck.
  const running = pieces.some((p) => p.status === "running") || scouting;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router]);

  // The server is the truth for whether the scout is still going.
  useEffect(() => setScouting(scoutBusy), [scoutBusy]);

  const scan = () =>
    start(async () => {
      try {
        await scanTopics(brand.id);
        toast.success("Scout queued — it researches for a few minutes. Watch Activity.");
        setScouting(true);
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "The scout couldn't run.");
      }
    });

  const startPiece = () =>
    start(async () => {
      try {
        await startContentPiece({
          brandId: brand.id,
          topic,
          kind,
          platforms,
          angleCount: angles,
          topicId,
        });
        toast.success("Queued — the agents pick it up within a couple of minutes.");
        setTopic("");
        setTopicId(null);
        setTab("pieces");
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't start that.");
      }
    });

  const useTopic = (t: ContentTopic) => {
    setTopic(t.title);
    setTopicId(t.id);
    setTab("pieces");
  };

  const money = (c: number) => `$${(c / 100).toFixed(2)}`;

  const tabs: Array<{ id: Tab; label: string; icon: typeof Search }> = [
    { id: "topics", label: `Topics${topics.length ? ` (${topics.length})` : ""}`, icon: Search },
    { id: "pieces", label: `Content${pieces.length ? ` (${pieces.length})` : ""}`, icon: FileText },
    { id: "campaigns", label: `Campaigns${campaigns.length ? ` (${campaigns.length})` : ""}`, icon: Megaphone },
    { id: "calendar", label: "Calendar", icon: CalendarIcon },
    { id: "voice", label: "Voice", icon: Sparkles },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  return (
    <div>
      <PageHeader
        title={brand.name}
        subtitle={[brand.industry, brand.service_area].filter(Boolean).join(" · ") || "No trade set"}
        actions={
          <span className="text-xs text-muted-foreground">
            {money(budget.spentCents)}
            {budget.budgetCents > 0 ? ` / ${money(budget.budgetCents)} this month` : " this month"}
          </span>
        }
      />

      {!brand.voice && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 mb-3 text-xs">
          No voice set for this brand — content will sound generic.{" "}
          <button onClick={() => setTab("voice")} className="underline font-medium">
            Set the voice
          </button>{" "}
          before you generate anything.
        </div>
      )}

      <div className="ch-tabs mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`ch-tab ${tab === t.id ? "active" : ""}`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "topics" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              The scout researches {brand.industry ?? "this trade"}
              {brand.service_area ? ` in ${brand.service_area}` : ""} — season, local events, what
              customers actually ask.
            </p>
            <Button onClick={scan} disabled={pending || scouting} size="sm" className="gap-1.5 shrink-0">
              {pending || scouting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {scouting ? "Researching…" : "Find topics"}
            </Button>
          </div>

          {topics.length === 0 ? (
            <div className="ch-empty">
              <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
              <p>No topics yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Run the scout to research the niche.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topics.map((t) => (
                <div key={t.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{t.title}</p>
                      {t.detail && (
                        <p className="text-xs text-muted-foreground mt-1 break-words">{t.detail}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="rounded-full border px-1.5 py-0.5">Priority {t.priority}</span>
                        {t.season && <span className="rounded-full border px-1.5 py-0.5">{t.season}</span>}
                        {t.source_urls.slice(0, 2).map((u) => (
                          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="underline">
                            source
                          </a>
                        ))}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => useTopic(t)} className="h-7 text-xs shrink-0">
                      Use
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "pieces" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Topic</label>
              <Input
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  setTopicId(null);
                }}
                placeholder="Why your roof leaks in heavy rain but not light rain"
              />
              {topicId && <p className="text-[10px] text-muted-foreground mt-1">Using the scout&apos;s research for this topic.</p>}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  title={k.blurb}
                  className={`text-xs rounded-md border px-2 py-1 ${kind === k.id ? "bg-primary/10 border-primary/40 text-primary" : "text-muted-foreground"}`}
                >
                  {k.label}
                </button>
              ))}
            </div>

            {kind !== "hooks" && (
              <div>
                <label className="text-xs text-muted-foreground">Platforms</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {PLATFORMS.map((p) => {
                    const on = platforms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        title={p.blurb}
                        onClick={() =>
                          setPlatforms((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                        }
                        className={`text-xs rounded-md border px-2 py-1 ${on ? "bg-primary/10 border-primary/40 text-primary" : "text-muted-foreground"}`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Angles</label>
                <select
                  value={angles}
                  onChange={(e) => setAngles(Number(e.target.value))}
                  className="block h-9 text-sm border rounded-md px-2 bg-background"
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground flex-1">
                {kind === "hooks"
                  ? `${angles} angles of hooks.`
                  : `${angles} angles × ${platforms.length} platform${platforms.length === 1 ? "" : "s"} = ${angles * platforms.length} variations.`}
              </p>
              <Button onClick={startPiece} disabled={pending || !topic.trim()}>
                {pending ? "Starting…" : "Generate"}
              </Button>
            </div>
          </div>

          {pieces.length === 0 ? (
            <div className="ch-empty">
              <Megaphone className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
              <p>Nothing generated yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pieces.map((p) => (
                <Link
                  key={p.id}
                  href={`/content/${brand.id}/piece/${p.id}`}
                  className="rounded-md border bg-card p-3 flex items-center justify-between gap-3 hover:border-primary/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{p.topic}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {p.kind} · {p.angle_count} angles
                      {p.platforms.length ? ` · ${p.platforms.join(", ")}` : ""}
                      {p.current_stage ? ` · ${p.current_stage}` : ""}
                    </p>
                  </div>
                  <span className={`ch-pill ${p.status === "failed" ? "cancelled" : p.status === "awaiting_approval" ? "pending" : p.status}`}>
                    {p.status === "running" && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
                    {p.status.replace(/_/g, " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "campaigns" && (
        <ContentCampaignsView brand={brand} campaigns={campaigns} topics={topics} />
      )}

      {tab === "calendar" && (
        <ContentCalendar
          entries={calendar}
          year={calendarMonth[0]}
          month={calendarMonth[1]}
          onMonth={setMonth}
        />
      )}

      {tab === "voice" && <ContentVoiceEditor brand={brand} />}

      {tab === "activity" && <ContentActivityTerminal brandId={brand.id} />}
    </div>
  );
}
