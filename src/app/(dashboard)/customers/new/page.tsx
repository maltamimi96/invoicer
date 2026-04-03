import { CustomerForm } from "@/components/customers/customer-form";

export default function NewCustomerPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Customer</h1>
        <p className="text-sm text-muted-foreground mt-1">Add a new customer to your account</p>
      </div>
      <CustomerForm />
    </div>
  );
}
