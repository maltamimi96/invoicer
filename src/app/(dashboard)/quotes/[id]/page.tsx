import { notFound } from "next/navigation";
import { getQuote } from "@/lib/actions/quotes";
import { getCustomers } from "@/lib/actions/customers";
import { getProducts } from "@/lib/actions/products";
import { getMaterials } from "@/lib/actions/materials";
import { getBusiness } from "@/lib/actions/business";
import { QuoteDetailClient } from "@/components/quotes/quote-detail-client";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [quote, customers, products, materials, business] = await Promise.all([
      getQuote(id), getCustomers(), getProducts(), getMaterials().catch(() => []), getBusiness(),
    ]);
    return <QuoteDetailClient quote={quote} customers={customers} products={products} materials={materials} business={business} />;
  } catch {
    notFound();
  }
}
