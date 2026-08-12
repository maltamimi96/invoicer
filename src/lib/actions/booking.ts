"use server";

/**
 * Booking admin server actions — the API surface for the Booking settings area.
 * AI-tool-first: flat scalar args, RLS does tenant isolation. Writes gated to
 * owner/admin/editor (matches the booking-table write RLS).
 *
 * Mirrored into MCP tools in src/lib/mcp/register-tools.ts (Phase 5).
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/permissions";
import type {
  BookingSettings, BookingForm, AppointmentType, BookingResource,
  BookingWorkingHours, BookingAvailabilityException, Appointment,
} from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function ctx(requireWrite = true) {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses").select("user_id").eq("id", businessId).single();
  let role: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (supabase as any).from("business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    role = (m?.role ?? "viewer") as Role;
  }
  if (requireWrite && !canEdit(role)) throw new Error("Forbidden");
  return { supabase, businessId, role };
}

function revalidate() { revalidatePath("/settings/booking"); }

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

// ---------------------------------------------------------------------------
// Settings (one row per business, lazy-created)
// ---------------------------------------------------------------------------
export async function getBookingSettings(): Promise<BookingSettings> {
  const { supabase, businessId } = await ctx(false);
  const { data } = await tbl(supabase, "booking_settings").select("*").eq("business_id", businessId).maybeSingle();
  if (data) return data as BookingSettings;
  const { data: created, error } = await tbl(supabase, "booking_settings")
    .insert({ business_id: businessId }).select("*").single();
  if (error) throw new Error(error.message);
  return created as BookingSettings;
}

export async function setBookingEnabled(enabled: boolean): Promise<void> {
  const { supabase, businessId } = await ctx();
  await getBookingSettings();
  const { error } = await tbl(supabase, "booking_settings")
    .update({ enabled }).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function setBookingSlug(slug: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, businessId } = await ctx();
  const clean = slug.trim().toLowerCase();
  if (!SLUG_RE.test(clean)) return { ok: false, error: "Use 3–40 lowercase letters, numbers or hyphens." };
  await getBookingSettings();
  const { error } = await tbl(supabase, "booking_settings").update({ slug: clean }).eq("business_id", businessId);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That link is already taken — try another." };
    return { ok: false, error: error.message };
  }
  revalidate();
  return { ok: true };
}

export async function updateBookingSettings(patch: Partial<Omit<BookingSettings,
  "business_id" | "slug" | "created_at" | "updated_at">>): Promise<void> {
  const { supabase, businessId } = await ctx();
  await getBookingSettings();
  const { error } = await tbl(supabase, "booking_settings").update(patch).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidate();
}

// ---------------------------------------------------------------------------
// Business-level booking option: block bookings on days a linked worker has an
// untimed (all-day) job. Stored on booking_settings (business-level record).
// ---------------------------------------------------------------------------
export async function getBlockUntimedJobs(): Promise<boolean> {
  const { supabase, businessId } = await ctx(false);
  await getBookingSettings(); // lazy-create
  const { data } = await tbl(supabase, "booking_settings").select("block_untimed_jobs").eq("business_id", businessId).maybeSingle();
  return Boolean(data?.block_untimed_jobs);
}

export async function setBlockUntimedJobs(value: boolean): Promise<void> {
  const { supabase, businessId } = await ctx();
  await getBookingSettings();
  const { error } = await tbl(supabase, "booking_settings").update({ block_untimed_jobs: value }).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidate();
}

// ---------------------------------------------------------------------------
// Booking forms (multiple per business) — each exposes a subset of the shared
// services/resources with its own slug, rules and branding.
// ---------------------------------------------------------------------------
export async function listForms(): Promise<BookingForm[]> {
  const { supabase, businessId } = await ctx(false);
  const { data } = await tbl(supabase, "booking_forms").select("*")
    .eq("business_id", businessId).order("sort_order").order("created_at");
  return (data ?? []) as BookingForm[];
}

export async function createForm(name: string): Promise<BookingForm> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "booking_forms")
    .insert({ business_id: businessId, name: name.trim() || "New form" }).select("*").single();
  if (error) throw new Error(error.message);
  revalidate();
  return data as BookingForm;
}

export async function updateForm(id: string, patch: Partial<Omit<BookingForm,
  "id" | "business_id" | "slug" | "created_at" | "updated_at">>): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "booking_forms").update(patch).eq("id", id).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function setFormSlug(id: string, slug: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, businessId } = await ctx();
  const clean = slug.trim().toLowerCase();
  if (!SLUG_RE.test(clean)) return { ok: false, error: "Use 3–40 lowercase letters, numbers or hyphens." };
  const { error } = await tbl(supabase, "booking_forms").update({ slug: clean }).eq("id", id).eq("business_id", businessId);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That link is already taken — try another." };
    return { ok: false, error: error.message };
  }
  revalidate();
  return { ok: true };
}

export async function deleteForm(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await tbl(supabase, "booking_forms").delete().eq("id", id).eq("business_id", businessId);
  revalidate();
}

// ---------------------------------------------------------------------------
// Appointment types
// ---------------------------------------------------------------------------
export async function listAppointmentTypes(): Promise<AppointmentType[]> {
  const { supabase, businessId } = await ctx(false);
  const { data } = await tbl(supabase, "appointment_types").select("*")
    .eq("business_id", businessId).order("sort_order", { ascending: true });
  return (data ?? []) as AppointmentType[];
}

export async function createAppointmentType(input: {
  name: string; durationMinutes: number; description?: string; bufferMinutes?: number;
  priceDisplay?: string; color?: string; eligibleResourceIds?: string[]; sortOrder?: number;
}): Promise<AppointmentType> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "appointment_types").insert({
    business_id: businessId, name: input.name.trim(),
    duration_minutes: input.durationMinutes,
    description: input.description?.trim() || null,
    buffer_minutes: input.bufferMinutes ?? null,
    price_display: input.priceDisplay?.trim() || null,
    color: input.color || null,
    eligible_resource_ids: input.eligibleResourceIds ?? [],
    sort_order: input.sortOrder ?? 0,
  }).select("*").single();
  if (error) throw new Error(error.message);
  revalidate();
  return data as AppointmentType;
}

export async function updateAppointmentType(id: string, patch: Partial<{
  name: string; duration_minutes: number; description: string | null; buffer_minutes: number | null;
  price_display: string | null; color: string | null; active: boolean; eligible_resource_ids: string[]; sort_order: number;
}>): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "appointment_types").update(patch).eq("id", id).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteAppointmentType(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await tbl(supabase, "appointment_types").delete().eq("id", id).eq("business_id", businessId);
  revalidate();
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------
export interface TeamMemberLite { id: string; name: string | null; email: string | null }

/** Team members (member_profiles) available to link a resource to. */
export async function listBookingTeamMembers(): Promise<TeamMemberLite[]> {
  const { supabase, businessId } = await ctx(false);
  const { data } = await tbl(supabase, "member_profiles")
    .select("id, name, email").eq("business_id", businessId).order("name");
  return (data ?? []) as TeamMemberLite[];
}

export async function listResources(): Promise<BookingResource[]> {
  const { supabase, businessId } = await ctx(false);
  const { data } = await tbl(supabase, "booking_resources").select("*")
    .eq("business_id", businessId).order("sort_order", { ascending: true });
  return (data ?? []) as BookingResource[];
}

export async function createResource(input: {
  displayName: string; memberProfileId?: string | null; sortOrder?: number;
}): Promise<BookingResource> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "booking_resources").insert({
    business_id: businessId, display_name: input.displayName.trim(),
    member_profile_id: input.memberProfileId ?? null, sort_order: input.sortOrder ?? 0,
  }).select("*").single();
  if (error) throw new Error(error.message);
  revalidate();
  return data as BookingResource;
}

export async function updateResource(id: string, patch: Partial<{
  display_name: string; member_profile_id: string | null; active: boolean; sort_order: number;
}>): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "booking_resources").update(patch).eq("id", id).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidate();
}

/**
 * Remove a resource — or, if anything was ever booked with it, retire it.
 *
 * This used to be an unconditional delete behind a bare trash icon, and the FK
 * was ON DELETE CASCADE: tidying up after a worker left took that worker's
 * entire appointment history with them, past and future, with no undo.
 *
 * The `active` flag already existed for exactly this. A retired resource stops
 * being offered for new bookings and everything already booked with it survives,
 * so the calendar and the audit log still make sense. Only a resource with no
 * appointments at all is actually deleted.
 *
 * Returns what happened so the UI can say so rather than claiming it deleted
 * something it retired.
 */
export async function deleteResource(id: string): Promise<{ deleted: boolean; appointments: number }> {
  const { supabase, businessId } = await ctx();

  const { count } = await tbl(supabase, "appointments")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId).eq("resource_id", id);
  const appointments = count ?? 0;

  if (appointments > 0) {
    const { error } = await tbl(supabase, "booking_resources")
      .update({ active: false }).eq("id", id).eq("business_id", businessId);
    if (error) throw new Error(error.message);
    revalidate();
    return { deleted: false, appointments };
  }

  const { error } = await tbl(supabase, "booking_resources")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidate();
  return { deleted: true, appointments: 0 };
}

// ---------------------------------------------------------------------------
// Working hours — replace-all for a resource (simplest mental model)
// ---------------------------------------------------------------------------
export async function listWorkingHours(resourceId: string): Promise<BookingWorkingHours[]> {
  const { supabase, businessId } = await ctx(false);
  const { data } = await tbl(supabase, "booking_working_hours").select("*")
    .eq("business_id", businessId).eq("resource_id", resourceId)
    .order("weekday").order("start_time");
  return (data ?? []) as BookingWorkingHours[];
}

export async function setWorkingHours(resourceId: string, blocks: Array<{
  weekday: number; start_time: string; end_time: string;
}>): Promise<void> {
  const { supabase, businessId } = await ctx();
  await tbl(supabase, "booking_working_hours").delete().eq("business_id", businessId).eq("resource_id", resourceId);
  if (blocks.length > 0) {
    const rows = blocks.map((b) => ({
      business_id: businessId, resource_id: resourceId,
      weekday: b.weekday, start_time: b.start_time, end_time: b.end_time,
    }));
    const { error } = await tbl(supabase, "booking_working_hours").insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidate();
}

// ---------------------------------------------------------------------------
// Availability exceptions (blackouts / custom hours)
// ---------------------------------------------------------------------------
export async function listExceptions(): Promise<BookingAvailabilityException[]> {
  const { supabase, businessId } = await ctx(false);
  const { data } = await tbl(supabase, "booking_availability_exceptions").select("*")
    .eq("business_id", businessId).order("date", { ascending: true });
  return (data ?? []) as BookingAvailabilityException[];
}

export async function createException(input: {
  date: string; isClosed: boolean; resourceId?: string | null;
  startTime?: string; endTime?: string; reason?: string;
}): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "booking_availability_exceptions").insert({
    business_id: businessId, date: input.date,
    is_closed: input.isClosed, resource_id: input.resourceId ?? null,
    start_time: input.isClosed ? null : input.startTime ?? null,
    end_time: input.isClosed ? null : input.endTime ?? null,
    reason: input.reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteException(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await tbl(supabase, "booking_availability_exceptions").delete().eq("id", id).eq("business_id", businessId);
  revalidate();
}

// ---------------------------------------------------------------------------
// Appointments (admin read)
// ---------------------------------------------------------------------------
export async function listAppointments(opts?: { from?: string; to?: string; limit?: number }): Promise<Appointment[]> {
  const { supabase, businessId } = await ctx(false);
  let q = tbl(supabase, "appointments").select("*").eq("business_id", businessId);
  if (opts?.from) q = q.gte("starts_at", opts.from);
  if (opts?.to) q = q.lte("starts_at", opts.to);
  const { data } = await q.order("starts_at", { ascending: true }).limit(opts?.limit ?? 200);
  return (data ?? []) as Appointment[];
}

export interface AppointmentDetail {
  appointment: Appointment;
  serviceName: string | null;
  resourceName: string | null;
  lead: { id: string; name: string } | null;
  workOrder: { id: string; number: string | null; status: string } | null;
  audit: Array<{ id: string; event: string; actor: string; detail: unknown; created_at: string }>;
}

export async function getAppointmentDetail(id: string): Promise<AppointmentDetail | null> {
  const { supabase, businessId } = await ctx(false);
  const { data: appt } = await tbl(supabase, "appointments").select("*").eq("id", id).eq("business_id", businessId).maybeSingle();
  if (!appt) return null;
  const a = appt as Appointment;
  const [svc, res, lead, wo, audit] = await Promise.all([
    a.appointment_type_id ? tbl(supabase, "appointment_types").select("name").eq("id", a.appointment_type_id).maybeSingle() : Promise.resolve({ data: null }),
    tbl(supabase, "booking_resources").select("display_name").eq("id", a.resource_id).maybeSingle(),
    a.lead_id ? tbl(supabase, "leads").select("id, name").eq("id", a.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    a.work_order_id ? tbl(supabase, "work_orders").select("id, number, status").eq("id", a.work_order_id).maybeSingle() : Promise.resolve({ data: null }),
    tbl(supabase, "booking_audit_log").select("id, event, actor, detail, created_at").eq("appointment_id", id).order("created_at", { ascending: true }),
  ]);
  return {
    appointment: a,
    serviceName: svc.data?.name ?? null,
    resourceName: res.data?.display_name ?? null,
    lead: lead.data ?? null,
    workOrder: wo.data ?? null,
    audit: (audit.data ?? []) as AppointmentDetail["audit"],
  };
}

export async function setAppointmentStatus(id: string, status: Appointment["status"]): Promise<void> {
  const { supabase, businessId } = await ctx();
  const patch: Record<string, unknown> = { status };
  if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
  const { error } = await tbl(supabase, "appointments").update(patch).eq("id", id).eq("business_id", businessId);
  if (error) throw new Error(error.message);

  // Same as the customer-facing cancel: take the generated job down with the
  // booking, or the crew keeps a cancelled visit on their schedule.
  if (status === "cancelled") {
    const { data: appt } = await tbl(supabase, "appointments")
      .select("work_order_id").eq("id", id).eq("business_id", businessId).maybeSingle();
    if (appt?.work_order_id) {
      await tbl(supabase, "work_orders").update({ status: "cancelled" })
        .eq("id", appt.work_order_id).eq("business_id", businessId);
    }
  }
  revalidatePath("/settings/booking");
}
