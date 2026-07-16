import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getContentPiece } from "@/lib/actions/seo-pipeline";
import { listConnections } from "@/lib/actions/seo-connections";
import { SeoContentDetail } from "@/components/seo/seo-content-detail";

export default async function SeoContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const piece = await getContentPiece(id);
  if (!piece) notFound();

  const connections = await listConnections(piece.site_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <SeoContentDetail piece={piece as any} connections={connections} />;
}
