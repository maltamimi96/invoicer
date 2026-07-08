"use client";

import { useEffect, useRef, useState } from "react";
import { listSeoActivity } from "@/lib/actions/seo-pipeline";
import { cn } from "@/lib/utils";

interface Event { id: string; agent_id: string | null; level: string; message: string; cost_cents: number; created_at: string }

/** Live terminal of agent activity for a site — polls every 3s and auto-scrolls. */
export function SeoActivityTerminal({ siteId }: { siteId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loaded, setLoaded] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const e = await listSeoActivity(siteId);
        if (alive) { setEvents(e as Event[]); setLoaded(true); }
      } catch { /* keep last good state */ }
    }
    poll();
    const iv = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [siteId]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [events]);

  const levelColor = (l: string) =>
    l === "error" ? "text-red-400" : l === "success" ? "text-emerald-400" : "text-blue-300";

  return (
    <div className="rounded-xl border border-border bg-[#0c0d0f] text-[#d6d3ca] font-mono text-xs overflow-hidden">
      <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
        <span className="text-[11px] uppercase tracking-wider text-white/50">Agent activity · live</span>
      </div>
      <div ref={boxRef} className="p-4 space-y-1 max-h-[30rem] overflow-y-auto">
        {!loaded ? (
          <p className="text-white/40">connecting…</p>
        ) : events.length === 0 ? (
          <p className="text-white/40">No activity yet. Start a content piece and the agents show up here in real time.</p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex items-start gap-2">
              <span className="text-white/30 shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
              <span className={cn("min-w-0 break-words", levelColor(e.level))}>{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
