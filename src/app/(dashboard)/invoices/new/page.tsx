import { getCustomers } from "@/lib/actions/customers";
import { getProducts } from "@/lib/actions/products";
import { getBusiness } from "@/lib/actions/business";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams;
  const [customers, products, business] = await Promise.all([getCustomers(), getProducts(), getBusiness()]);
  return (
    <div className="max-w-5xl mx-auto">
      <InvoiceEditor customers={customers} products={products} business={business} defaultCustomerId={customer} />
    </div>
  );
}
