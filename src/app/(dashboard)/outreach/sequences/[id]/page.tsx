import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getSequence } from "@/lib/actions/outreach";
import { SequenceBuilder } from "@/components/outreach/sequence-builder";

export default async function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  try {
    const { sequence, steps } = await getSequence(id);
    return <SequenceBuilder sequence={sequence} initialSteps={steps} />;
  } catch {
    notFound();
  }
}
