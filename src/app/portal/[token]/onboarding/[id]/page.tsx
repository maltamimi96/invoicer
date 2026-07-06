import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft, ClipboardList } from "@/components/ui/icons";
import { isEncryptedAnswer } from "@/lib/onboarding/crypto";
import { OnboardingFill } from "@/components/customer-portal/onboarding-fill";
import type { OnboardingField, OnboardingAnswers } from "@/types/database";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export default async function PortalOnboardingPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const sb = createAdminClient();

  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at").eq("token", token).maybeSingle();
  if (!link || link.revoked_at) notFound();
  if (link.expires_at && new Date(link.expires_at) < new Date()) notFound();

  const { data: request } = await tbl(sb, "onboarding_requests")
    .select("id, form_id, status").eq("id", id)
    .eq("business_id", link.business_id).eq("customer_id", link.customer_id).maybeSingle();
  if (!request) notFound();

  const [{ data: form }, { data: business }, { data: response }] = await Promise.all([
    tbl(sb, "onboarding_forms").select("name, description, schema, settings").eq("id", request.form_id).maybeSingle(),
    tbl(sb, "businesses").select("name, logo_url, phone").eq("id", link.business_id).maybeSingle(),
    tbl(sb, "onboarding_responses").select("answers, draft, submitted_at").eq("request_id", id).maybeSingle(),
  ]);
  if (!form) notFound();

  const schema = (form.schema ?? []) as OnboardingField[];
  // Never ship ciphertext to the browser — mark saved secure answers instead.
  const initialAnswers: OnboardingAnswers = {};
  for (const [k, v] of Object.entries((response?.answers ?? {}) as OnboardingAnswers)) {
    initialAnswers[k] = isEncryptedAnswer(v) ? { saved: true } : v;
  }

  const submitted = request.status === "completed" && !form.settings?.allow_edit_after_submit;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <Link href={`/portal/${token}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-3">
            {business?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logo_url} alt={business.name} className="w-12 h-12 rounded-lg object-contain bg-white border border-border p-1" />
            ) : null}
            <div className="text-right">
              <p className="font-semibold text-sm">{business?.name}</p>
              {business?.phone && <p className="text-xs text-muted-foreground">{business.phone}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList className="w-5 h-5 text-teal-600" />
          <h1 className="text-2xl font-semibold">{form.name}</h1>
        </div>
        {form.description && <p className="text-sm text-muted-foreground mb-6">{form.description}</p>}

        <OnboardingFill
          token={token}
          requestId={id}
          fields={schema}
          initialAnswers={initialAnswers}
          alreadySubmitted={submitted}
          thankYouMessage={form.settings?.thank_you_message ?? null}
        />

        <footer className="text-center text-xs text-muted-foreground py-8">Powered by Kirei</footer>
      </main>
    </div>
  );
}
