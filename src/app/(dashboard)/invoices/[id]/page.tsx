import { notFound } from "next/navigation";
import { getInvoice, getChildInvoices } from "@/lib/actions/invoices";
import { getCustomers } from "@/lib/actions/customers";
import { getProducts } from "@/lib/actions/products";
import { getBusiness } from "@/lib/actions/business";
import { InvoiceDetailClient } from "@/components/invoices/invoice-detail-client";
import type { Invoice } from "@/types/database";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [invoice, customers, products, business] = await Promise.all([
      getInvoice(id), getCustomers(), getProducts(), getBusiness(),
    ]);

    // Surface linked progress invoices on both sides — viewing the parent
    // shows children, viewing a child shows the parent + siblings.
    let progressInvoices: Invoice[] = [];
    let parentInvoice: Invoice | null = null;
    if (invoice.parent_invoice_id) {
      const [parent, siblings] = await Promise.all([
        getInvoice(invoice.parent_invoice_id).catch(() => null),
        getChildInvoices(invoice.parent_invoice_id).catch(() => []),
      ]);
      parentInvoice    = parent as Invoice | null;
      progressInvoices = siblings;
    } else {
      progressInvoices = await getChildInvoices(id).catch(() => []);
    }

    return (
      <InvoiceDetailClient
        invoice={invoice}
        customers={customers}
        products={products}
        business={business}
        progressInvoices={progressInvoices}
        parentInvoice={parentInvoice}
      />
    );
  } catch {
    notFound();
  }
}
