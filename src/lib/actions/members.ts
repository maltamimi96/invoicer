"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { canManageTeam, isOwner, type Role } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";
import { teamInviteEmailHtml } from "@/lib/emails/team-invite";
import type { BusinessMember, MemberRole } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function getCallerRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, businessId: string): Promise<Role> {
  const { data: biz } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).single();
  if (biz?.user_id === userId) return "owner";
  const { data: member } = await tbl(supabase, "business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return (member?.role ?? "viewer") as Role;
}

export async function getMembers(): Promise<BusinessMember[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "business_members")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as BusinessMember[];
}

export async function addMember(email: string, role: MemberRole): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const callerRole = await getCallerRole(supabase, user.id, businessId);

  if (!canManageTeam(callerRole)) throw new Error("Only owners and admins can add members");
  // Admins cannot add other admins — only the owner can
  if (role === "admin" && !isOwner(callerRole)) throw new Error("Only the owner can add admins");

  // Check if there's already a Supabase auth user with this email — if so, link immediately
  // We can't look up auth.users directly from the client, so we store the email and the
  // activate_pending_memberships() RPC will link them on their next login.
  const { error } = await tbl(supabase, "business_members").insert({
    business_id: businessId,
    email: email.toLowerCase().trim(),
    role,
    status: "pending",
    added_by: user.id,
  });
  if (error) {
    if (error.code === "23505") throw new Error("This email has already been added to this business");
    throw error;
  }

  // Send invite email (best-effort — don't fail the whole operation if email fails)
  try {
    const { data: biz } = await tbl(supabase, "businesses").select("name").eq("id", businessId).single();
    const inviterName = user.user_metadata?.full_name ?? user.email ?? "Your team owner";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const params = new URLSearchParams({ email: email.toLowerCase().trim(), biz: businessId });
    const inviteUrl = `${appUrl}/auth/register?${params.toString()}`;

    await sendEmail({
      to: email.toLowerCase().trim(),
      subject: `You've been invited to ${biz?.name ?? "a team"} on Invoicer`,
      html: teamInviteEmailHtml({
        businessName: biz?.name ?? "a team",
        inviterName,
        role,
        inviteUrl,
      }),
    });
  } catch {
    // Email failure is non-fatal — the invite link can still be copied manually
  }

  revalidatePath("/settings");
}

export async function updateMemberRole(memberId: string, newRole: MemberRole): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const callerRole = await getCallerRole(supabase, user.id, businessId);

  if (!canManageTeam(callerRole)) throw new Error("Only owners and admins can change roles");
  // Only owner can promote/demote admins
  if (newRole === "admin" && !isOwner(callerRole)) throw new Error("Only the owner can assign the admin role");

  const { data: target } = await tbl(supabase, "business_members")
    .select("role, business_id")
    .eq("id", memberId)
    .eq("business_id", businessId)
    .single();
  if (!target) throw new Error("Member not found");
  if (target.role === "admin" && !isOwner(callerRole)) throw new Error("Only the owner can change an admin's role");

  const { error } = await tbl(supabase, "business_members")
    .update({ role: newRole })
    .eq("id", memberId)
    .eq("business_id", businessId);
  if (error) throw error;

  revalidatePath("/settings");
}

export async function removeMember(memberId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const callerRole = await getCallerRole(supabase, user.id, businessId);

  if (!canManageTeam(callerRole)) throw new Error("Only owners and admins can remove members");

  const { data: target } = await tbl(supabase, "business_members")
    .select("role, business_id")
    .eq("id", memberId)
    .eq("business_id", businessId)
    .single();
  if (!target) throw new Error("Member not found");
  if (target.role === "admin" && !isOwner(callerRole)) throw new Error("Only the owner can remove an admin");

  const { error } = await tbl(supabase, "business_members")
    .delete()
    .eq("id", memberId)
    .eq("business_id", businessId);
  if (error) throw error;

  revalidatePath("/settings");
}
