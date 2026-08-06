"use server";

/**
 * Per-business client profile fields.
 *
 * The industry preset supplies defaults; a business can override them. See
 * src/lib/customers/field-schema.ts for why this exists rather than a fixed
 * set of columns.
 *
 * Expected failures are RETURNED, not thrown. Next.js masks thrown
 * server-action messages in production, so anything the user can act on has to
 * come back as data — learned the hard way from the onboarding send bug.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { resolveCustomerFields, pruneAnswers, isUsingPresetDefaults } from "@/lib/customers/field-schema";
import {
  resolveAccountTypes, isUsingPresetAccountTypes, validateAccountTypes, type AccountTypeOption,
} from "@/lib/customers/account-types";
import type { OnboardingField } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

const ALLOWED_TYPES = new Set([
  "short_text", "long_text", "instructions", "email", "phone", "url", "address",
  "abn", "company", "dropdown", "multi_select", "radio", "checkboxes", "yes_no",
  "number", "currency", "date", "time", "file", "image", "rating", "consent",
  "heading", "divider",
]);

export interface ClientFieldConfig {
  fields: OnboardingField[];
  /** True when nothing has been customised — the preset's defaults are in use. */
  usingPresetDefaults: boolean;
  industryPreset: string | null;
  /** Client TYPE options (Residential / Retainer client / …). */
  accountTypes: AccountTypeOption[];
  usingPresetAccountTypes: boolean;
}

export async function getClientFieldConfig(): Promise<ClientFieldConfig> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // Check the error: a failed read here previously fell through to the generic
  // defaults, which looks exactly like a business that has no preset.
  const { data, error } = await tbl(supabase, "businesses")
    .select("customer_field_schema, customer_type_options, industry_preset")
    .eq("id", businessId).maybeSingle();
  if (error) throw new Error(`Couldn't load your client settings: ${error.message}`);

  return {
    fields: resolveCustomerFields(data?.customer_field_schema, data?.industry_preset),
    usingPresetDefaults: isUsingPresetDefaults(data?.customer_field_schema),
    industryPreset: data?.industry_preset ?? null,
    accountTypes: resolveAccountTypes(data?.customer_type_options, data?.industry_preset),
    usingPresetAccountTypes: isUsingPresetAccountTypes(data?.customer_type_options),
  };
}

/** Replace the business's client TYPE options. */
export async function saveClientAccountTypes(options: AccountTypeOption[]): Promise<SaveFieldsResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const problem = validateAccountTypes(options);
  if (problem) return { ok: false, error: problem };

  const { error } = await tbl(supabase, "businesses")
    .update({ customer_type_options: options }).eq("id", businessId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/client-fields");
  revalidatePath("/customers");
  return { ok: true, count: options.length };
}

export type SaveFieldsResult = { ok: true; count: number } | { ok: false; error: string };

/** Replace the business's client fields. An empty array is valid — it means none. */
export async function saveClientFields(fields: OnboardingField[]): Promise<SaveFieldsResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  if (!Array.isArray(fields)) return { ok: false, error: "Invalid fields" };
  if (fields.length > 60) return { ok: false, error: "That's more than 60 fields — split them across an onboarding form instead." };

  const seen = new Set<string>();
  for (const f of fields) {
    if (!f?.id?.trim()) return { ok: false, error: "Every field needs an id" };
    if (!f?.label?.trim()) return { ok: false, error: `The field "${f.id}" needs a label` };
    if (!ALLOWED_TYPES.has(f.type)) {
      // 'secure' is deliberately excluded: a client profile is read by anyone
      // who can see the customer, so it's the wrong home for a credential.
      return { ok: false, error: `"${f.type}" can't be used on a client profile` };
    }
    // Duplicate ids would make one field's answer overwrite another's.
    if (seen.has(f.id)) return { ok: false, error: `Two fields share the id "${f.id}"` };
    seen.add(f.id);
  }

  const { error } = await tbl(supabase, "businesses")
    .update({ customer_field_schema: fields }).eq("id", businessId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/client-fields");
  revalidatePath("/customers");
  return { ok: true, count: fields.length };
}

/** Drop the override and go back to whatever the industry preset ships. */
export async function resetClientFieldsToPreset(): Promise<SaveFieldsResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // Both halves go back together — a half-reset business is a state nobody
  // asked for and can't see they're in.
  const { error } = await tbl(supabase, "businesses")
    .update({ customer_field_schema: null, customer_type_options: null }).eq("id", businessId);
  if (error) return { ok: false, error: error.message };

  const cfg = await getClientFieldConfig();
  revalidatePath("/settings/client-fields");
  revalidatePath("/customers");
  return { ok: true, count: cfg.fields.length };
}

/**
 * Save a customer's answers to those fields.
 *
 * Answers for fields that no longer exist are dropped rather than kept — an
 * orphaned answer is invisible in the UI but would resurface if its id were
 * ever reused, showing one client's data under another's label.
 */
export async function saveCustomerFieldValues(
  customerId: string, values: Record<string, unknown>,
): Promise<SaveFieldsResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const cfg = await getClientFieldConfig();
  const clean = pruneAnswers(values, cfg.fields);

  const { error } = await tbl(supabase, "customers")
    .update({ custom_fields: clean }).eq("id", customerId).eq("business_id", businessId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/customers/${customerId}`);
  return { ok: true, count: Object.keys(clean).length };
}
