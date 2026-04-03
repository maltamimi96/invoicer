"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { canManageTeam, isOwner } from "@/lib/permissions";
import type { MemberProfile } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function getCallerRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, businessId: string) {
  const { data: biz } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).single();
  if (biz?.user_id === userId) return "owner" as const;
  const { data: m } = await tbl(supabase, "business_members")
    .select("role").eq("business_id", businessId).eq("user_id", userId).eq("status", "active").maybeSingle();
  return ((m?.role ?? "viewer") as "admin" | "editor" | "viewer");
}

export async function getMemberProfiles(): Promise<MemberProfile[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "member_profiles")
    .select("*")
    .eq("business_id", businessId)
    .order("name");
  if (error) throw error;
  return data as MemberProfile[];
}

export async function getAssignableProfiles(): Promise<Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'>[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "member_profiles")
    .select("id, name, email, avatar_url, role_title")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createMemberProfile(payload: {
  email: string;
  name: string;
  phone?: string;
  role_title?: string;
  skills?: string[];
  bio?: string;
}): Promise<MemberProfile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const callerRole = await getCallerRole(supabase, user.id, businessId);
  if (!canManageTeam(callerRole)) throw new Error("Only owners and admins can create profiles");

  const { data, error } = await tbl(supabase, "member_profiles").insert({
    business_id: businessId,
    email: payload.email.toLowerCase().trim(),
    name: payload.name.trim(),
    phone: payload.phone ?? null,
    role_title: payload.role_title ?? null,
    skills: payload.skills ?? [],
    bio: payload.bio ?? null,
  }).select().single();

  if (error) {
    if (error.code === "23505") throw new Error("A profile for this email already exists");
    throw error;
  }

  revalidatePath("/team");
  revalidatePath("/work-orders/new");
  return data as MemberProfile;
}

export async function updateMemberProfile(
  profileId: string,
  payload: Partial<Pick<MemberProfile, 'name' | 'phone' | 'avatar_url' | 'role_title' | 'skills' | 'bio' | 'is_active'>>
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const callerRole = await getCallerRole(supabase, user.id, businessId);

  // Owner/admin can edit any profile; workers can only edit their own
  if (!canManageTeam(callerRole)) {
    const { data: profile } = await tbl(supabase, "member_profiles")
      .select("user_id").eq("id", profileId).eq("business_id", businessId).single();
    if (profile?.user_id !== user.id) throw new Error("You can only edit your own profile");
  }

  const { error } = await tbl(supabase, "member_profiles")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .eq("business_id", businessId);
  if (error) throw error;

  revalidatePath("/team");
  revalidatePath("/work-orders");
}

export async function deleteMemberProfile(profileId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const callerRole = await getCallerRole(supabase, user.id, businessId);
  if (!isOwner(callerRole)) throw new Error("Only the owner can delete profiles");

  const { error } = await tbl(supabase, "member_profiles")
    .delete()
    .eq("id", profileId)
    .eq("business_id", businessId);
  if (error) throw error;

  revalidatePath("/team");
  revalidatePath("/work-orders");
}

export async function uploadMemberAvatar(profileId: string, formData: FormData): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const file = formData.get("avatar") as File;
  if (!file) throw new Error("No file provided");

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/${profileId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("logos")
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);

  await tbl(supabase, "member_profiles")
    .update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .eq("business_id", businessId);

  revalidatePath("/team");
  return urlData.publicUrl;
}
