import { notFound } from "next/navigation";
import {
  getContentBrand,
  listContentTopics,
  listContentPieces,
  getContentBudget,
  scoutRunning,
} from "@/lib/actions/content";
import { ContentBrandHub } from "@/components/content/content-brand-hub";

/**
 * A brand's hub — research, generate, watch.
 *
 * Route-gated by the plugin resolver in (dashboard)/layout.tsx.
 */
export default async function ContentBrandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const [brand, topics, pieces, budget, scoutBusy] = await Promise.all([
      getContentBrand(id),
      listContentTopics(id),
      listContentPieces(id),
      getContentBudget(),
      scoutRunning(id),
    ]);

    return (
      <ContentBrandHub
        brand={brand}
        topics={topics}
        pieces={pieces}
        budget={budget}
        scoutBusy={scoutBusy}
      />
    );
  } catch {
    // Not found, or not this business's brand — RLS makes those the same thing.
    notFound();
  }
}
