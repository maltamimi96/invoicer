"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { Business } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (supabase: Awaited<ReturnType<typeof createClient>>, name: string) => (supabase as any).from(name);

export async function getBusinesses(): Promise<Business[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await tbl(supabase, "businesses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Business[];
}

export async function getBusiness(): Promise<Business> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "businesses").select("*").eq("id", businessId).single();
  if (error) throw error;
  return data as Business;
}

export async function setActiveBusiness(businessId: string): Promise<void> {
  // Verify the business belongs to the current user before setting cookie
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Allow if user owns the business OR is an active member
  const { data: owned } = await tbl(supabase, "businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) {
    const { data: member } = await tbl(supabase, "business_members")
      .select("business_id")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member) throw new Error("Business not found");
  }

  const cookieStore = await cookies();
  cookieStore.set("active_business_id", businessId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  revalidatePath("/", "layout");
}

export async function createBusiness(payload: {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postcode?: string;
  country?: string;
  currency?: string;
}): Promise<Business> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await tbl(supabase, "businesses")
    .insert({
      user_id: user.id,
      name: payload.name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      address: payload.address ?? null,
      city: payload.city ?? null,
      postcode: payload.postcode ?? null,
      country: payload.country ?? "Australia",
      currency: payload.currency ?? "AUD",
    })
    .select()
    .single();

  if (error) throw error;

  // Auto-switch to the new business
  const cookieStore = await cookies();
  cookieStore.set("active_business_id", data.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return data as Business;
}

export async function updateBusiness(payload: Partial<Business>): Promise<Business> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "businesses")
    .update(payload)
    .eq("id", businessId)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return data as Business;
}

export async function savePdfSettings(
  pdfSettings: import("@/types/database").PdfSettings,
  bankDetails?: {
    bank_name?: string | null;
    bank_account_name?: string | null;
    bank_account_number?: string | null;
    bank_sort_code?: string | null;
    bank_iban?: string | null;
  }
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const payload: Record<string, unknown> = { pdf_settings: pdfSettings };
  if (bankDetails) Object.assign(payload, bankDetails);

  // Split: always save bank details to known columns; pdf_settings needs the migration
  const { pdf_settings, ...bankOnly } = payload as Record<string, unknown> & { pdf_settings?: unknown };

  if (Object.keys(bankOnly).length > 0) {
    const { error: bankErr } = await tbl(supabase, "businesses")
      .update(bankOnly)
      .eq("id", businessId);
    if (bankErr) throw bankErr;
  }

  if (pdf_settings !== undefined) {
    const { error: pdfErr } = await tbl(supabase, "businesses")
      .update({ pdf_settings })
      .eq("id", businessId);
    if (pdfErr) {
      if ((pdfErr as { code?: string }).code === "42703") {
        throw new Error(
          "pdf_settings column missing — run the migration in your Supabase SQL editor:\n\nALTER TABLE businesses ADD COLUMN IF NOT EXISTS pdf_settings jsonb DEFAULT '{}';",
        );
      }
      throw pdfErr;
    }
  }

  revalidatePath("/settings");
  revalidatePath("/invoices", "layout");
  revalidatePath("/quotes", "layout");
}

export async function uploadLogo(formData: FormData): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const file = formData.get("logo") as File;
  if (!file) throw new Error("No file provided");

  const ext = file.name.split(".").pop();
  const path = `${user.id}/${businessId}/logo.${ext}`;

  const { error: uploadError } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);

  await tbl(supabase, "businesses")
    .update({ logo_url: urlData.publicUrl })
    .eq("id", businessId)
    .eq("user_id", user.id);

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  return urlData.publicUrl;
}
