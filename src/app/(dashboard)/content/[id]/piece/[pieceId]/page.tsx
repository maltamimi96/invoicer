import { notFound } from "next/navigation";
import { getContentBrand, getContentPiece, listContentVariations } from "@/lib/actions/content";
import { ContentPieceDetail } from "@/components/content/content-piece-detail";

/**
 * One generated piece: its variations, and the agents' working.
 *
 * Route-gated by the plugin resolver in (dashboard)/layout.tsx.
 */
export default async function ContentPiecePage({
  params,
}: {
  params: Promise<{ id: string; pieceId: string }>;
}) {
  const { id, pieceId } = await params;

  try {
    const [brand, piece, variations] = await Promise.all([
      getContentBrand(id),
      getContentPiece(pieceId),
      listContentVariations(pieceId),
    ]);

    // The piece id is a UUID a user could retype; make sure it really is this
    // brand's, so the header doesn't claim a piece belongs to someone it doesn't.
    if (piece.brand_id !== id) notFound();

    return <ContentPieceDetail piece={piece} variations={variations} brandName={brand.name} />;
  } catch {
    // Not found, or not this business's — RLS makes those the same thing.
    notFound();
  }
}
