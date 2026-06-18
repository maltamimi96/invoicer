"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, User, MapPin, StickyNote, Building2, CreditCard } from "@/components/ui/icons";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-methods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressFields } from "@/components/addresses/address-fields";
import { FormSection, AnimatedPress } from "@/components/ui/kirei";
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
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  // null = all methods the business supports; explicit list = exactly those.
  allowed_payment_methods: z.array(z.string()).nullable().optional(),
});

type FormData = z.infer<typeof schema>;

interface CustomerFormProps {
  customer?: Customer;
  onSuccess?: (customer: Customer) => void;
  /** Country of the active business — drives address-field labels + states. */
  businessCountry?: string | null;
}

export function CustomerForm({ customer, onSuccess, businessCountry }: CustomerFormProps) {
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
      state: customer?.state ?? "",
      postcode: customer?.postcode ?? "",
      country: customer?.country ?? "",
      notes: customer?.notes ?? "",
      allowed_payment_methods: customer?.allowed_payment_methods ?? null,
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
        allowed_payment_methods:
          data.allowed_payment_methods && data.allowed_payment_methods.length
            ? data.allowed_payment_methods
            : null,
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <FormSection
        icon={<Building2 className="w-4 h-4" />}
        gradient="violet"
        title="Customer type"
        hint="What kind of account this is — drives reporting + invoice defaults"
      >
        <Controller
          name="account_type"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select type" /></SelectTrigger>
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
      </FormSection>

      <FormSection
        icon={<User className="w-4 h-4" />}
        gradient="primary"
        title="Contact"
        hint="Who to reach and how"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full name *</Label>
              <Input className="h-11 rounded-xl" placeholder="John Smith" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{showCompanyHint ? "Company / organisation" : "Company"}</Label>
              <Input className="h-11 rounded-xl" placeholder={showCompanyHint ? "Acme Strata Pty Ltd" : "Acme Ltd (optional)"} {...register("company")} />
            </div>
            <div className="space-y-1.5">
              <Label>Role / title</Label>
              <Input className="h-11 rounded-xl" placeholder="Director, Strata manager, etc." {...register("contact_role")} />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input className="h-11 rounded-xl" placeholder="https://acme.com" {...register("website")} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" className="h-11 rounded-xl" placeholder="john@acme.com" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input className="h-11 rounded-xl" placeholder="+44 7700 000000" {...register("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label>Secondary phone</Label>
              <Input className="h-11 rounded-xl" placeholder="Office / after-hours" {...register("secondary_phone")} />
            </div>
            <div className="space-y-1.5">
              <Label>Preferred contact</Label>
              <Controller
                name="preferred_contact"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || "any"} onValueChange={field.onChange}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
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
            <Input className="h-11 rounded-xl" placeholder="GB123456789" {...register("tax_number")} />
          </div>
      </FormSection>

      <FormSection
        icon={<MapPin className="w-4 h-4" />}
        gradient="emerald"
        title="Address"
        hint="Start typing the street address to autofill city, state, postcode and country"
      >
        <AddressFields
          country={watch("country") || businessCountry}
          values={{
            address:  watch("address")  ?? "",
            city:     watch("city")     ?? "",
            state:    watch("state")    ?? "",
            postcode: watch("postcode") ?? "",
            country:  watch("country")  ?? "",
          }}
          onChange={(next) => {
            setValue("address",  next.address);
            setValue("city",     next.city);
            setValue("state",    next.state);
            setValue("postcode", next.postcode);
            setValue("country",  next.country);
          }}
        />
      </FormSection>

      <FormSection
        icon={<CreditCard className="w-4 h-4" />}
        gradient="blue"
        title="Payment methods"
        hint="Which ways this customer is allowed to pay. Leave all unticked to offer every method you support."
      >
        <Controller
          name="allowed_payment_methods"
          control={control}
          render={({ field }) => {
            const selected = field.value ?? [];
            const toggle = (m: PaymentMethod, on: boolean) => {
              const next = on ? [...selected, m] : selected.filter((x) => x !== m);
              // Empty selection → null (= inherit all supported methods).
              field.onChange(next.length ? next : null);
            };
            return (
              <div className="space-y-2.5">
                {PAYMENT_METHODS.map((m) => {
                  const checked = selected.includes(m);
                  return (
                    <label key={m} className="flex items-center gap-3 cursor-pointer rounded-xl border border-border px-3.5 py-2.5 hover:bg-muted/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggle(m, e.target.checked)}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span className="text-sm font-medium">{PAYMENT_METHOD_LABELS[m]}</span>
                    </label>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  {selected.length === 0
                    ? "All supported methods offered (card if Stripe is connected, bank transfer if bank details are set)."
                    : `Only the ticked method${selected.length > 1 ? "s" : ""} will be offered to this customer.`}
                </p>
              </div>
            );
          }}
        />
      </FormSection>

      <FormSection
        icon={<StickyNote className="w-4 h-4" />}
        gradient="amber"
        title="Notes"
        hint="Internal notes — never shown to the customer"
      >
        <Textarea className="rounded-xl" placeholder="Internal notes about this customer…" rows={3} {...register("notes")} />
      </FormSection>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => router.back()}>Cancel</Button>
        <AnimatedPress
          onClick={handleSubmit(onSubmit) as unknown as () => void}
          className={`flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm cursor-pointer ${isSubmitting ? "opacity-70" : ""}`}
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {customer ? "Save changes" : "Create customer"}
        </AnimatedPress>
      </div>
    </form>
  );
}
