import { notFound } from "next/navigation";
import { getInvoice } from "@/lib/actions/invoices";
import { getCustomers } from "@/lib/actions/customers";
import { getProducts } from "@/lib/actions/products";
import { getBusiness } from "@/lib/actions/business";
import { InvoiceDetailClient } from "@/components/invoices/invoice-detail-client";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [invoice, customers, products, business] = await Promise.all([
      getInvoice(id), getCustomers(), getProducts(), getBusiness(),
    ]);
    return <InvoiceDetailClient invoice={invoice} customers={customers} products={products} business={business} />;
  } catch {
    notFound();
  }
}
