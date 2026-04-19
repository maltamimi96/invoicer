"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import type { Customer } from "@/types/database";

const ACCOUNT_TYPES: { value: Customer["account_type"]; label: string; hint?: string }[] = [
  { value: "residential",   label: "Residential",          hint: "Homeowner / private individual" },
  { value: "commercial",    label: "Commercial",           hint: "Business client" },
  { value: "developer",     label: "Developer",            hint: "Property developer / builder-developer" },
  { value: "agent",         label: "Real estate agent",    hint: "Sales / leasing agent" },
  { value: "builder",       label: "Builder",              hint: "Construction company" },
  { value: "strata",        label: "Strata company",       hint: "Body corporate / owners corp" },
  { value: "property_mgmt", label: "Property manager",     hint: "Manages rental properties" },
  { value: "government",    label: "Government",           hint: "Council / public sector" },
  { value: "non_profit",    label: "Non-profit / charity" },
  { value: "other",         label: "Other" },
];

const PREFERRED_CONTACT: { value: NonNullable<Customer["preferred_contact"]>; label: string }[] = [
  { value: "any",   label: "Any" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone call" },
  { value: "sms",   label: "SMS" },
];

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  secondary_phone: z.string().optional(),
  company: z.string().optional(),
  contact_role: z.string().optional(),
  website: z.string().optional(),
  tax_number: z.string().optional(),
  account_type: z.string(),
  preferred_contact: z.string().optional(),
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
  const { register, handleSubmit, control, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      secondary_phone: customer?.secondary_phone ?? "",
      company: customer?.company ?? "",
      contact_role: customer?.contact_role ?? "",
      website: customer?.website ?? "",
      tax_number: customer?.tax_number ?? "",
      account_type: customer?.account_type ?? "residential",
      preferred_contact: customer?.preferred_contact ?? "any",
      address: customer?.address ?? "",
      city: customer?.city ?? "",
      postcode: customer?.postcode ?? "",
      country: customer?.country ?? "",
      notes: customer?.notes ?? "",
    },
  });

  const accountType = watch("account_type");
  const showCompanyHint = accountType !== "residential" && accountType !== "individual";

  const onSubmit = async (data: FormData) => {
    try {
      const payload = {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        secondary_phone: data.secondary_phone || null,
        company: data.company || null,
        contact_role: data.contact_role || null,
        website: data.website || null,
        tax_number: data.tax_number || null,
        account_type: data.account_type as Customer["account_type"],
        preferred_contact: (data.preferred_contact || null) as Customer["preferred_contact"],
        address: data.address || null,
        city: data.city || null,
        postcode: data.postcode || null,
        country: data.country || null,
        notes: data.notes || null,
      };
      const result = customer
        ? await updateCustomer(customer.id, payload)
        : await createCustomer({ ...payload, archived: false });
      toast.success(customer ? "Customer updated" : "Customer created");
      if (onSuccess) { onSuccess(result); return; }
      router.push(`/customers/${result.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Type */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Customer type</h3>
          <Controller
            name="account_type"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex flex-col items-start">
                        <span>{t.label}</span>
                        {t.hint && <span className="text-xs text-muted-foreground">{t.hint}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </CardContent>
      </Card>

      {/* Contact */}
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
              <Label>{showCompanyHint ? "Company / organisation" : "Company"}</Label>
              <Input placeholder={showCompanyHint ? "Acme Strata Pty Ltd" : "Acme Ltd (optional)"} {...register("company")} />
            </div>
            <div className="space-y-1.5">
              <Label>Role / title</Label>
              <Input placeholder="Director, Strata manager, etc." {...register("contact_role")} />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input placeholder="https://acme.com" {...register("website")} />
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
            <div className="space-y-1.5">
              <Label>Secondary phone</Label>
              <Input placeholder="Office / after-hours" {...register("secondary_phone")} />
            </div>
            <div className="space-y-1.5">
              <Label>Preferred contact</Label>
              <Controller
                name="preferred_contact"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || "any"} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PREFERRED_CONTACT.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>VAT / Tax number</Label>
            <Input placeholder="GB123456789" {...register("tax_number")} />
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Address</h3>
          <div className="space-y-1.5">
            <Label>Search address</Label>
            <Controller
              name="address"
              control={control}
              render={({ field }) => (
                <AddressAutocomplete
                  value={field.value || ""}
                  onChange={field.onChange}
                  onSelect={(s) => {
                    setValue("address", s.address || s.label.split(",")[0]);
                    if (s.city) setValue("city", s.city);
                    if (s.postcode) setValue("postcode", s.postcode);
                    if (s.country) setValue("country", s.country);
                  }}
                  placeholder="Start typing — 123 High Street, London..."
                />
              )}
            />
            <p className="text-xs text-muted-foreground">Pick a suggestion to auto-fill city, postcode, and country.</p>
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

      {/* Notes */}
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
