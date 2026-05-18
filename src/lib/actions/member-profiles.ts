"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { canManageTeam, isOwner } from "@/lib/permissions";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { teamInviteEmailHtml } from "@/lib/emails/team-invite";
import type { MemberProfile, MemberRole } from "@/types/database";

import { getUser } from "@/lib/auth";
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
  const user = await getUser();

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
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "member_profiles")
    .select("id, name, email, avatar_url, role_title")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** 8-char readable invite code (no ambiguous chars) — same scheme as members.ts. */
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function createMemberProfile(payload: {
  email: string;
  name: string;
  phone?: string;
  role_title?: string;
  skills?: string[];
  bio?: string;
  /** When true (default), also creates a pending business_members row +
   *  emails the new teammate a login invite with code. Same flow as
   *  Settings → Team → Add member. */
  send_invite?: boolean;
  /** Login role for the invite. Defaults to 'worker'. */
  role?: MemberRole;
}): Promise<MemberProfile> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);
  const callerRole = await getCallerRole(supabase, user.id, businessId);
  if (!canManageTeam(callerRole)) throw new Error("Only owners and admins can create profiles");

  const cleanEmail = payload.email.toLowerCase().trim();

  const { data, error } = await tbl(supabase, "member_profiles").insert({
    business_id: businessId,
    email: cleanEmail,
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

  // Send the login invite email + create the pending business_members row so
  // the new teammate can actually sign in. Best-effort — profile creation
  // succeeds even if the invite plumbing fails (we just toast a warning).
  const sendInvite = payload.send_invite !== false;
  if (sendInvite) {
    const role = payload.role ?? "worker";
    try {
      // Skip if they're already a member (e.g. owner re-adding their own profile).
      const { data: existingMember } = await tbl(supabase, "business_members")
        .select("id, status, invite_token")
        .eq("business_id", businessId)
        .eq("email", cleanEmail)
        .maybeSingle();

      let inviteToken = (existingMember?.invite_token as string | undefined) ?? null;
      if (!existingMember) {
        inviteToken = generateInviteCode();
        await tbl(supabase, "business_members").insert({
          business_id: businessId,
          email:        cleanEmail,
          role,
          status:       "pending",
          invite_token: inviteToken,
          added_by:     user.id,
        });
      } else if (!inviteToken) {
        // Backfill an invite token on an old pending row that's missing one.
        inviteToken = generateInviteCode();
        await tbl(supabase, "business_members")
          .update({ invite_token: inviteToken })
          .eq("id", existingMember.id);
      }

      const { data: biz } = await tbl(supabase, "businesses").select("name").eq("id", businessId).single();
      const inviterName = user.user_metadata?.full_name ?? user.email ?? "Your team owner";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kireihq.com";
      const params = new URLSearchParams({ email: cleanEmail, biz: businessId });
      const inviteUrl = `${appUrl}/auth/register?${params.toString()}`;

      await sendEmail({
        to: cleanEmail,
        subject: `You've been invited to ${biz?.name ?? "a team"} on Kirei`,
        html: teamInviteEmailHtml({
          businessName: biz?.name ?? "a team",
          inviterName,
          role,
          inviteUrl,
          inviteCode: inviteToken!,
        }),
        from: biz?.name ? buildBusinessFrom({ name: biz.name, localPart: "team" }) : undefined,
        tags: { business_id: businessId, doc_type: "team_invite" },
      });
    } catch {
      // Non-fatal — the profile is still usable, owner can resend from Settings → Team.
    }
  }

  revalidatePath("/team");
  revalidatePath("/work-orders/new");
  revalidatePath("/settings");
  return data as MemberProfile;
}

export async function updateMemberProfile(
  profileId: string,
  payload: Partial<Pick<MemberProfile, 'name' | 'phone' | 'avatar_url' | 'role_title' | 'skills' | 'bio' | 'is_active'>>
): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

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
  const user = await getUser();

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
  const user = await getUser();

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
