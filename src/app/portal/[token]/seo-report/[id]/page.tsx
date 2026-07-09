import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Download } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

function fmt(d: string): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function PortalSeoReportPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const sb = createAdminClient();

  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at").eq("token", token).maybeSingle();
  if (!link || link.revoked_at) notFound();
  if (link.expires_at && new Date(link.expires_at) < new Date()) notFound();

  const { data: report } = await tbl(sb, "seo_reports")
    .select("*, seo_sites(domain, customer_id)").eq("id", id).eq("business_id", link.business_id).maybeSingle();
  if (!report || report.seo_sites?.customer_id !== link.customer_id) notFound();

  const { data: business } = await tbl(sb, "businesses").select("name, logo_url").eq("id", link.business_id).maybeSingle();

  const m = report.metrics ?? {};
  const content = report.work_log?.contentShipped ?? [];
  const rankings = m.rankings ?? [];
  const pdfHref = `/api/pdf/seo-report/${id}?token=${token}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="font-semibold">{business?.name ?? "SEO Report"}</div>
          <a href={pdfHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm rounded-md border border-border px-3 py-1.5 hover:bg-muted">
            <Download className="w-4 h-4" /> Download PDF
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">SEO Report</h1>
          <p className="text-muted-foreground">{report.seo_sites?.domain} · {fmt(report.period_start)} – {fmt(report.period_end)}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Tracked keywords" value={m.trackedKeywords ?? 0} />
          <Stat label="Clicks" value={m.totalClicks ?? 0} />
          <Stat label="Impressions" value={m.totalImpressions ?? 0} />
          <Stat label="Content shipped" value={content.length} />
        </div>

        <Card className="p-5">
          <h2 className="font-semibold mb-3">Rankings movement</h2>
          {rankings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ranking data will appear here once Search Console is connected.</p>
          ) : (
            <div className="text-sm">
              <div className="flex text-xs text-muted-foreground border-b border-border pb-1 mb-1">
                <span className="flex-[3]">Keyword</span><span className="flex-1 text-right">From</span><span className="flex-1 text-right">To</span><span className="flex-1 text-right">Change</span>
              </div>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {rankings.slice(0, 20).map((r: any, i: number) => (
                <div key={i} className="flex py-1 border-b border-border/50">
                  <span className="flex-[3] break-words">{r.keyword}</span>
                  <span className="flex-1 text-right">{r.from ?? "–"}</span>
                  <span className="flex-1 text-right">{r.to ?? "–"}</span>
                  <span className={`flex-1 text-right ${(r.change ?? 0) > 0 ? "text-emerald-600" : (r.change ?? 0) < 0 ? "text-red-600" : "text-muted-foreground"}`}>{r.change == null ? "–" : r.change > 0 ? `+${r.change}` : r.change}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {content.length > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Work delivered</h2>
            <ul className="text-sm space-y-1 list-disc pl-5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {content.map((c: any, i: number) => <li key={i}>{c.title}</li>)}
            </ul>
          </Card>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
