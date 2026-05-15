import { CustomerForm } from "@/components/customers/customer-form";
import { getBusiness } from "@/lib/actions/business";
import { PageHeader } from "@/components/layout/page-header";

export default async function NewCustomerPage() {
  const business = await getBusiness().catch(() => null);
  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="New customer"
        subtitle="Add a customer to your account"
        accent="linear-gradient(180deg, #3a847e 0%, #1f4f4a 100%)"
      />
      <CustomerForm businessCountry={business?.country ?? null} />
    </div>
  );
}
