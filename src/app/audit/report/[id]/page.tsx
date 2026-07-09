import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Download } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

const SEV_ORDER = ["critical", "high", "medium", "low"];
const SEV_TONE: Record<string, string> = {
  critical: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700", low: "bg-sky-100 text-sky-700",
};

export default async function AuditReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token } = await searchParams;
  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: audit } = await (sb as any).from("seo_audits").select("*").eq("id", id).maybeSingle();
  if (!audit || !token || audit.view_token !== token) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: business } = await (sb as any).from("businesses").select("name, logo_url").eq("id", audit.business_id).maybeSingle();

  const result = audit.result ?? {};
  const score = Math.max(0, Math.min(100, Math.round(result.score ?? 0)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findings = [...(result.findings ?? [])].sort((a: any, b: any) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const pending = audit.status !== "done";

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-emerald-50/40">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="font-semibold text-emerald-700">{business?.name ?? "SEO Audit"}</div>
          {!pending && (
            <a href={`/api/pdf/seo-audit/${id}?token=${token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm rounded-md border border-slate-200 px-3 py-1.5 hover:bg-slate-50">
              <Download className="w-4 h-4" /> Download PDF
            </a>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900">SEO Audit</h1>
        <p className="text-slate-500">{audit.url}</p>

        {pending ? (
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="font-semibold">Your audit is being prepared…</p>
            <p className="text-sm text-slate-500 mt-1">Check back in a few minutes — we&apos;ll email you when it&apos;s ready.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-center gap-5 rounded-xl border border-slate-200 bg-white p-6">
              <div className="w-20 h-20 rounded-full border-4 border-emerald-600 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-emerald-700">{score}</span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Overall score</p>
                <p className="text-sm text-slate-600 mt-1">{result.summary ?? "Audit complete."}</p>
              </div>
            </div>

            <h2 className="mt-8 mb-3 font-semibold text-slate-900">Findings ({findings.length})</h2>
            <div className="space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {findings.map((f: any, i: number) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 ${SEV_TONE[f.severity] ?? "bg-slate-100 text-slate-600"}`}>{f.severity}</span>
                  <p className="font-semibold text-slate-900 mt-1.5">{f.title}</p>
                  {f.detail && <p className="text-sm text-slate-600 mt-0.5">{f.detail}</p>}
                  {f.fix && <p className="text-sm text-emerald-700 mt-1">Fix: {f.fix}</p>}
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-xl bg-emerald-600 text-white p-6 text-center">
              <p className="font-semibold">Want {business?.name ?? "us"} to fix these for you?</p>
              <p className="text-sm text-emerald-50 mt-1">Reply to the email we sent, and we&apos;ll take it from here.</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
