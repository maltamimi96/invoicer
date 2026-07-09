import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuditLandingForm } from "@/components/seo/audit-landing-form";

export const dynamic = "force-dynamic";

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: business } = await (sb as any).from("businesses").select("name, logo_url").eq("audit_slug", slug).maybeSingle();
  if (!business) notFound();
  return <AuditLandingForm slug={slug} businessName={business.name ?? "SEO Audit"} logoUrl={business.logo_url ?? null} />;
}
