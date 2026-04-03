import { notFound } from "next/navigation";
import { getQuote } from "@/lib/actions/quotes";
import { getCustomers } from "@/lib/actions/customers";
import { getProducts } from "@/lib/actions/products";
import { getBusiness } from "@/lib/actions/business";
import { QuoteDetailClient } from "@/components/quotes/quote-detail-client";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [quote, customers, products, business] = await Promise.all([
      getQuote(id), getCustomers(), getProducts(), getBusiness(),
    ]);
    return <QuoteDetailClient quote={quote} customers={customers} products={products} business={business} />;
  } catch {
    notFound();
  }
}
