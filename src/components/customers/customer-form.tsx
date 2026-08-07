"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, User, MapPin, StickyNote, Building2, CreditCard, ListChecks, ClipboardList, Landmark } from "@/components/ui/icons";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import { saveStaffOnboardingResponse } from "@/lib/actions/onboarding";
import { ClientFields } from "@/components/customers/client-fields";
import { StaffOnboardingFill, type StaffFillForm, type StaffFillValue } from "@/components/onboarding/staff-onboarding-fill";
import { pruneAnswers } from "@/lib/customers/field-schema";
import { saveCustomerBankDetails } from "@/lib/actions/customer-bank";
import { validateBankDetails, formatBsb, maskedAccount } from "@/lib/customers/bank";
import {
  staffFillProblems, staffFillErrorMessage, type StaffFillProblem,
} from "@/lib/onboarding/staff-fill";
import {
  resolveAccountTypes, withCurrentValue, defaultAccountType, type AccountTypeOption,
} from "@/lib/customers/account-types";
import type { OnboardingField } from "@/types/database";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, cardProvidersLabel, type PaymentMethod } from "@/lib/payment-methods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressFields } from "@/components/addresses/address-fields";
import { FormSection, AnimatedPress } from "@/components/ui/kirei";
import type { Customer } from "@/types/database";

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
  /** Which card providers are connected, so the card toggle names the one that
   *  will actually serve the payment instead of assuming Stripe. */
  cardProviders?: { stripeEnabled: boolean; revolutEnabled: boolean };
  /** Extra profile fields for this business (industry preset, or its override).
   *  Empty array is a real answer: this business wants none. */
  clientFields?: OnboardingField[];
  /** Onboarding forms staff can fill in here. Omitted when the plugin is off. */
  onboardingForms?: StaffFillForm[];
  /** Client types for this business. Empty = fall back to the generic list, so
   *  a caller that hasn't been updated still renders a usable dropdown. */
  accountTypes?: AccountTypeOption[];
  /** Whether credential fields can be staff-filled (server has a key). */
  allowSecureFill?: boolean;
}

export function CustomerForm({
  customer, onSuccess, businessCountry, clientFields = [], onboardingForms = [],
  accountTypes = [], allowSecureFill = false, cardProviders,
}: CustomerFormProps) {
  // An existing customer's type is always offered, even if the business has
  // since changed its list — otherwise editing them would silently reclassify.
  const typeOptions = withCurrentValue(
    accountTypes.length ? accountTypes : resolveAccountTypes(null, null),
    customer?.account_type,
  );
  const router = useRouter();
  const [custom, setCustom] = useState<Record<string, unknown>>(
    (customer?.custom_fields as Record<string, unknown>) ?? {},
  );
  const [fill, setFill] = useState<StaffFillValue>({ formId: "", answers: {} });
  const [fillProblems, setFillProblems] = useState<StaffFillProblem[]>([]);
  // Bank details are write-only from here: what's stored is encrypted and
  // never sent back to the browser, so these start blank even when editing.
  const [bank, setBank] = useState({ accountName: "", bsb: "", accountNumber: "" });
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
      account_type: customer?.account_type ?? defaultAccountType(typeOptions),
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

  // "Company / organisation" vs "Company": only a private individual is a
  // person rather than an organisation, and which value means that differs
  // per industry, so key off the handful of personal types.
  const accountType = watch("account_type");
  const showCompanyHint = !["residential", "individual"].includes(accountType);

  const onSubmit = async (data: FormData) => {
    // Bank details checked before anything is written, same reasoning as the
    // onboarding form below: a half-entered BSB shouldn't cost you the client.
    const bankProblem = validateBankDetails(bank);
    if (bankProblem) { toast.error(bankProblem); return; }

    // Check the attached onboarding form BEFORE creating anything. Finding out
    // afterwards leaves the client saved and the form not — and the answers
    // typed into this screen gone, to be re-entered from their profile.
    if (!customer && fill.formId) {
      const picked = onboardingForms.find((f) => f.id === fill.formId);
      const problems = picked ? staffFillProblems(picked.schema, fill.answers, { allowSecure: allowSecureFill }) : [];
      setFillProblems(problems);
      if (problems.length) {
        toast.error(staffFillErrorMessage(problems));
        document.getElementById("onboarding-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

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
        account_type: data.account_type,
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
        // Answers to fields that no longer exist are dropped rather than kept:
        // an orphan is invisible but would resurface if its id were reused.
        custom_fields: pruneAnswers(custom, clientFields),
      };
      const result = customer
        ? await updateCustomer(customer.id, payload)
        : await createCustomer({ ...payload, archived: false });
      toast.success(customer ? "Customer updated" : "Customer created");

      // The customer exists now, so the onboarding answers have something to
      // attach to. Anything wrong with them was caught before we got here.
      const enteredBank = Boolean(bank.bsb.trim() || bank.accountNumber.trim() || bank.accountName.trim());
      if (enteredBank) {
        const res = await saveCustomerBankDetails(result.id, bank);
        if (res.ok) setBank({ accountName: "", bsb: "", accountNumber: "" });
        else toast.error(`Customer saved, but the bank details weren't: ${res.error}`);
      }

      if (!customer && fill.formId) {
        const res = await saveStaffOnboardingResponse(fill.formId, result.id, fill.answers);
        if (res.ok) toast.success("Onboarding form saved against this customer");
        else toast.error(`Customer saved, but the onboarding form wasn't: ${res.error}`);
      }

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
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {typeOptions.map((t) => (
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
              <Input placeholder="John Smith" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{showCompanyHint ? "Company / organisation" : "Company"}</Label>
              <Input placeholder={showCompanyHint ? "Acme Pty Ltd" : "Acme Ltd (optional)"} {...register("company")} />
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
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{PAYMENT_METHOD_LABELS[m]}</span>
                        {m === "card" && cardProviders && (
                          <span className="block text-xs text-muted-foreground">
                            {cardProvidersLabel(cardProviders)}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  {selected.length === 0
                    ? "All supported methods offered — card if a card provider is connected, bank transfer if your bank details are set."
                    : `Only the ticked method${selected.length > 1 ? "s" : ""} will be offered to this customer.`}
                </p>
              </div>
            );
          }}
        />
      </FormSection>

      {clientFields.length > 0 && (
        <FormSection
          icon={<ListChecks className="w-4 h-4" />}
          gradient="violet"
          title="Details"
          hint="Set by your industry — change them under Settings → Client fields"
        >
          <ClientFields
            fields={clientFields}
            values={custom}
            onChange={(id, v) => setCustom((prev) => ({ ...prev, [id]: v }))}
          />
        </FormSection>
      )}

      {/* Create only — an existing customer has the richer Onboarding tab,
          which also handles sending and viewing. */}
      {!customer && onboardingForms.length > 0 && (
        <div id="onboarding-section">
          <FormSection
            icon={<ClipboardList className="w-4 h-4" />}
            gradient="blue"
            title="Onboarding"
            hint="Already have their details? Fill the form in here instead of sending it."
          >
            <StaffOnboardingFill
              forms={onboardingForms}
              value={fill}
              problems={fillProblems}
              allowSecure={allowSecureFill}
              onChange={(next) => { setFill(next); setFillProblems([]); }}
            />
          </FormSection>
        </div>
      )}

      <FormSection
        icon={<Landmark className="w-4 h-4" />}
        gradient="emerald"
        title="Bank details"
        hint="For direct debit. Stored encrypted — only an owner or admin can read them back."
      >
        <div className="space-y-4">
          {customer?.bank_account_last3 && (
            <p className="text-sm text-muted-foreground">
              On file: <span className="font-medium text-foreground">{maskedAccount(customer.bank_account_last3)}</span>
              {customer.bank_account_name ? <> &middot; {customer.bank_account_name}</> : null}.
              Entering new details replaces them; leaving these blank keeps what&rsquo;s stored.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Account name</Label>
              <Input
                placeholder="As it appears on the account"
                value={bank.accountName}
                onChange={(e) => setBank((b) => ({ ...b, accountName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>BSB</Label>
              <Input
                inputMode="numeric"
                placeholder="062-000"
                value={bank.bsb}
                onChange={(e) => setBank((b) => ({ ...b, bsb: e.target.value }))}
                onBlur={(e) => setBank((b) => ({ ...b, bsb: formatBsb(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account number</Label>
              <Input
                inputMode="numeric"
                placeholder="12345678"
                value={bank.accountNumber}
                onChange={(e) => setBank((b) => ({ ...b, accountNumber: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Never put card numbers here. A card is stored by your payment provider and charged through them &mdash;
            see Settings &rarr; Payments.
          </p>
        </div>
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
        <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>Cancel</Button>
        <AnimatedPress
          onClick={handleSubmit(onSubmit) as unknown as () => void}
          className={`flex-1 inline-flex items-center justify-center gap-2  bg-primary text-primary-foreground text-sm font-semibold shadow-sm cursor-pointer ${isSubmitting ? "opacity-70" : ""}`}
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {customer ? "Save changes" : "Create customer"}
        </AnimatedPress>
      </div>
    </form>
  );
}
