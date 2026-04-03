"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import type { Customer } from "@/types/database";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  tax_number: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface CustomerFormProps {
  customer?: Customer;
  onSuccess?: (customer: Customer) => void;
}

export function CustomerForm({ customer, onSuccess }: CustomerFormProps) {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: customer ? {
      name: customer.name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      company: customer.company ?? "",
      tax_number: customer.tax_number ?? "",
      address: customer.address ?? "",
      city: customer.city ?? "",
      postcode: customer.postcode ?? "",
      country: customer.country ?? "",
      notes: customer.notes ?? "",
    } : {},
  });

  const onSubmit = async (data: FormData) => {
    try {
      const result = customer
        ? await updateCustomer(customer.id, data)
        : await createCustomer({
            name: data.name,
            email: data.email ?? null,
            phone: data.phone ?? null,
            company: data.company ?? null,
            tax_number: data.tax_number ?? null,
            address: data.address ?? null,
            city: data.city ?? null,
            postcode: data.postcode ?? null,
            country: data.country ?? null,
            notes: data.notes ?? null,
            archived: false,
          });
      toast.success(customer ? "Customer updated" : "Customer created");
      if (onSuccess) { onSuccess(result); return; }
      router.push(`/customers/${result.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Contact</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full name *</Label>
              <Input placeholder="John Smith" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input placeholder="Acme Ltd" {...register("company")} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="john@acme.com" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input placeholder="+44 7700 000000" {...register("phone")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>VAT / Tax number</Label>
            <Input placeholder="GB123456789" {...register("tax_number")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Address</h3>
          <div className="space-y-1.5">
            <Label>Street address</Label>
            <Input placeholder="123 High Street" {...register("address")} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input placeholder="London" {...register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label>Postcode</Label>
              <Input placeholder="SW1A 1AA" {...register("postcode")} />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Input placeholder="United Kingdom" {...register("country")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Notes</h3>
          <Textarea placeholder="Internal notes about this customer..." rows={3} {...register("notes")} />
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {customer ? "Save changes" : "Create customer"}
        </Button>
      </div>
    </form>
  );
}
