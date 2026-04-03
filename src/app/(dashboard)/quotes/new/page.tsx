import { getCustomers } from "@/lib/actions/customers";
import { getProducts } from "@/lib/actions/products";
import { getBusiness } from "@/lib/actions/business";
import { QuoteEditor } from "@/components/quotes/quote-editor";

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams;
  const [customers, products, business] = await Promise.all([getCustomers(), getProducts(), getBusiness()]);
  return (
    <div className="max-w-5xl mx-auto">
      <QuoteEditor customers={customers} products={products} business={business} defaultCustomerId={customer} />
    </div>
  );
}
