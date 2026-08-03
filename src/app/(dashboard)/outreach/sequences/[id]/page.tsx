import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getSequence, getOutreachSettings } from "@/lib/actions/outreach";
import { SequenceBuilder } from "@/components/outreach/sequence-builder";

export default async function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);

  // The preview renders with the business's real design + name, so it matches
  // what actually sends rather than approximating it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: business } = await (supabase as any)
    .from("businesses").select("name, logo_url").eq("id", businessId).maybeSingle();

  try {
    const [{ sequence, steps }, settings] = await Promise.all([
      getSequence(id),
      getOutreachSettings(),
    ]);
    return (
      <SequenceBuilder
        sequence={sequence}
        initialSteps={steps}
        settings={settings}
        businessName={business?.name ?? "Your business"}
        businessLogoUrl={business?.logo_url ?? null}
      />
    );
  } catch {
    notFound();
  }
}
