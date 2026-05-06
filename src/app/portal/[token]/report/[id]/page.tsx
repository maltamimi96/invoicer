import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Download } from "@/components/ui/icons";
import { formatDate } from "@/lib/utils";
import type { Report } from "@/types/database";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export default async function PortalReportPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const sb = createAdminClient();

  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || link.revoked_at) notFound();
  if (link.expires_at && new Date(link.expires_at) < new Date()) notFound();

  const [{ data: report }, { data: business }] = await Promise.all([
    tbl(sb, "reports")
      .select("*")
      .eq("id", id)
      .eq("business_id", link.business_id)
      .eq("customer_id", link.customer_id)
      .maybeSingle(),
    tbl(sb, "businesses").select("name, logo_url, license_number").eq("id", link.business_id).maybeSingle(),
  ]);
  if (!report) notFound();

  const r = report as Report;
  const m = r.meta;
  const inspectorLine = m.inspector_name + (m.inspector_license ? `  (Lic. ${m.inspector_license})` : "");

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href={`/portal/${token}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          {business?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt={business.name} className="w-8 h-8 rounded object-contain" />
          ) : (
            <span className="text-sm font-semibold">{business?.name}</span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Title */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold">{r.title}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              From {business?.name} · {r.report_date ? `Report ${formatDate(r.report_date)}` : ""}
              {r.inspection_date ? ` · Inspected ${formatDate(r.inspection_date)}` : ""}
            </p>
          </div>
          <Badge variant="secondary" className={r.status === "complete"
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}>
            {r.status === "complete" ? "Final" : "Draft"}
          </Badge>
        </div>

        {/* Property summary */}
        <Card className="p-5 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Property &amp; inspection</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {[
              ["Property", r.property_address],
              ["Roof type", m.roof_type],
              ["Roof features", m.roof_features],
              ["Inspection method", m.inspection_method],
              ["Inspector", inspectorLine],
              ["Inspection date", r.inspection_date ? formatDate(r.inspection_date) : null],
            ].map(([k, v]) => (
              <div key={k}>
                <span className="text-muted-foreground text-xs">{k}</span>
                <p className="font-medium">{v || "—"}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Sections */}
        {r.sections.map((sec) => sec.content?.trim() ? (
          <Card key={sec.id} className="p-5 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{sec.title}</p>
            <p className="text-sm whitespace-pre-line">{sec.content}</p>
          </Card>
        ) : null)}

        {/* Photos */}
        {r.photos.length > 0 && (
          <Card className="p-5 space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Photos ({r.photos.length})</p>
            <div className="grid grid-cols-2 gap-3">
              {r.photos.map((p) => (
                <div key={p.id} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption || "Site photo"} className="w-full aspect-video object-cover rounded" />
                  {p.caption && <p className="text-xs text-muted-foreground">{p.caption}</p>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* PDF download */}
        <Card className="p-6 text-center">
          <a
            href={`/api/pdf/report/${r.id}?token=${token}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download full PDF report
          </a>
        </Card>

        <footer className="text-center text-xs text-muted-foreground py-6 border-t">
          Powered by Invoicer
        </footer>
      </main>
    </div>
  );
}
