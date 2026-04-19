import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, FileDown, CheckCircle2, Clock, Camera } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtDateTime(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default async function PublicJobPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: workOrder } = await (sb as any)
    .from("work_orders")
    .select("*, customers(name, company), businesses(name, accent_color, logo_url)")
    .eq("share_token", token)
    .maybeSingle();

  if (!workOrder) notFound();

  const businessId = workOrder.business_id;
  const id = workOrder.id;

  const [siteRes, timelineRes, photosRes, docsRes, sigsRes] = await Promise.all([
    workOrder.site_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (sb as any).from("sites").select("label, address, city, postcode").eq("id", workOrder.site_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any).from("job_timeline_events")
      .select("*").eq("work_order_id", id).eq("business_id", businessId)
      .eq("visible_to_customer", true).order("created_at", { ascending: false }).limit(50),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any).from("job_photos")
      .select("*").eq("work_order_id", id).eq("business_id", businessId)
      .eq("customer_visible", true).order("captured_at", { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any).from("job_documents")
      .select("*").eq("work_order_id", id).eq("business_id", businessId)
      .eq("customer_visible", true).order("uploaded_at", { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any).from("job_signatures")
      .select("*").eq("work_order_id", id).eq("business_id", businessId).order("signed_at", { ascending: true }),
  ]);

  const site = siteRes.data;
  const timeline = (timelineRes.data ?? []) as Array<{ id: string; type: string; created_at: string; payload: Record<string, unknown> | null }>;
  const photos = (photosRes.data ?? []) as Array<{ id: string; url: string; phase: string; caption: string | null }>;
  const docs = (docsRes.data ?? []) as Array<{ id: string; name: string; url: string }>;
  const sigs = (sigsRes.data ?? []) as Array<{ id: string; signed_by_name: string; signed_by_role: string | null; signature_url: string; purpose: string; signed_at: string }>;

  const photosByPhase = {
    before: photos.filter((p) => p.phase === "before"),
    during: photos.filter((p) => p.phase === "during"),
    after: photos.filter((p) => p.phase === "after"),
  };

  const accent = workOrder.businesses?.accent_color || "#B8860B";

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Job update from</p>
            <p className="font-semibold truncate" style={{ color: accent }}>{workOrder.businesses?.name ?? "Service provider"}</p>
          </div>
          <Link href={`/api/pdf/work-order/${id}?token=${token}`}>
            <Button size="sm" variant="outline"><FileDown className="w-4 h-4 mr-1.5" />Download PDF</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-mono">{workOrder.number}</p>
                <h1 className="text-xl font-bold truncate">{workOrder.title}</h1>
              </div>
              <Badge variant="secondary" className="capitalize shrink-0">{String(workOrder.status).replace(/_/g, " ")}</Badge>
            </div>
            {workOrder.reported_issue && (
              <p className="text-sm text-muted-foreground">{workOrder.reported_issue}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pt-2">
              {site && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span>{[site.label, site.address, site.city, site.postcode].filter(Boolean).join(", ")}</span>
                </div>
              )}
              {workOrder.scheduled_date && (
                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span>{new Date(workOrder.scheduled_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {(["before", "during", "after"] as const).map((phase) => (
          photosByPhase[phase].length > 0 && (
            <Card key={phase}>
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold mb-3 capitalize flex items-center gap-2">
                  <Camera className="w-4 h-4" />{phase} ({photosByPhase[phase].length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {photosByPhase[phase].map((p) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="block aspect-square">
                      <img src={p.url} alt={p.caption ?? ""} className="w-full h-full object-cover rounded" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        ))}

        {timeline.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4" />Activity</h2>
              <ul className="space-y-3">
                {timeline.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p className="text-xs text-muted-foreground">{fmtDateTime(e.created_at)}</p>
                    <p>{describePublicEvent(e.type, e.payload)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {docs.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold mb-3">Documents</h2>
              <ul className="space-y-1.5">
                {docs.map((d) => (
                  <li key={d.id}>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{d.name}</a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {sigs.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Sign-off</h2>
              <div className="space-y-3">
                {sigs.map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.signature_url} alt="signature" className="h-12 w-24 object-contain bg-white border rounded" />
                    <div className="text-sm">
                      <p className="font-medium">{s.signed_by_name}{s.signed_by_role ? ` (${s.signed_by_role})` : ""}</p>
                      <p className="text-xs text-muted-foreground capitalize">{s.purpose.replace(/_/g, " ")} · {fmtDateTime(s.signed_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center pt-4">
          This is a private link. Don&apos;t share it with anyone you don&apos;t trust with this job&apos;s details.
        </p>
      </main>
    </div>
  );
}

function describePublicEvent(type: string, payload: Record<string, unknown> | null): string {
  switch (type) {
    case "status_change": return `Status changed to ${payload?.to ?? "unknown"}`;
    case "rescheduled": return `Rescheduled to ${payload?.to ?? "a new time"}`;
    case "scope_change": return "Scope of work updated";
    case "assigned": return "Worker assigned";
    case "photo_added": return `Photo added (${payload?.phase ?? "general"})`;
    case "document_uploaded": return `Document uploaded: ${payload?.name ?? ""}`;
    case "signature_captured": return `Signed by ${payload?.signed_by ?? ""}`;
    case "note_added": return typeof payload?.message === "string" ? payload.message : "Note added";
    case "time_started": return "Work started";
    case "time_ended": return "Work paused";
    default: return type.replace(/_/g, " ");
  }
}
