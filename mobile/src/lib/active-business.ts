import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import type { Role } from "./permissions";

export interface MobileBusiness {
  id: string;
  name: string;
  logo_url: string | null;
  currency: string | null;
  country: string | null;
  user_id: string; // owner
}

const ACTIVE_KEY = "kirei.active_business";

/** Pull every business this user has access to — businesses they own AND
 *  business_members rows where they have an active membership. Same logic
 *  as the web app's getAllBusinessesForUser, kept simple for mobile. */
async function fetchAccessibleBusinesses(userId: string): Promise<MobileBusiness[]> {
  // Owned
  const { data: owned } = await supabase
    .from("businesses")
    .select("id, name, logo_url, currency, country, user_id")
    .eq("user_id", userId);

  // Memberships
  const { data: memberRows } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId)
    .eq("status", "active");

  const memberIds = (memberRows ?? []).map((r) => r.business_id);
  let memberBizzes: MobileBusiness[] = [];
  if (memberIds.length > 0) {
    const { data } = await supabase
      .from("businesses")
      .select("id, name, logo_url, currency, country, user_id")
      .in("id", memberIds);
    memberBizzes = (data ?? []) as MobileBusiness[];
  }

  // Dedupe by id (owner could also be a member somehow)
  const seen = new Set<string>();
  const merged: MobileBusiness[] = [];
  for (const b of [...(owned ?? []), ...memberBizzes]) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    merged.push(b as MobileBusiness);
  }
  return merged;
}

/** Resolve the caller's role within a business: owner if user_id matches,
 *  otherwise the role on business_members.
 *
 *  Fails CLOSED: if the membership row can't be read (RLS hiccup, pending
 *  status, transient error) we return 'worker' — the most restricted role —
 *  rather than 'viewer', so a real worker can NEVER be shown the full
 *  owner/admin dashboard because their role didn't resolve. A genuine viewer
 *  still gets 'viewer' only when we positively read that value. */
async function fetchRoleForBusiness(userId: string, business: MobileBusiness): Promise<Role> {
  if (business.user_id === userId) return "owner";
  const { data, error } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", business.id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data?.role) return "worker"; // fail closed — most restricted
  return data.role as Role;
}

export interface UseActiveBusinessResult {
  loading: boolean;
  businesses: MobileBusiness[];
  active: MobileBusiness | null;
  role: Role;
  /** Switch to a different business by id; persists across launches. */
  switchTo: (businessId: string) => Promise<void>;
  /** Force a re-fetch (after creating a new business / accepting an invite). */
  refresh: () => Promise<void>;
}

/** Single source of truth on the device for which business the user is in.
 *  Components consume this to render the right tabs / fetch the right data. */
export function useActiveBusiness(): UseActiveBusinessResult {
  const [loading, setLoading] = useState(true);
  const [businesses, setBusinesses] = useState<MobileBusiness[]>([]);
  const [active, setActive] = useState<MobileBusiness | null>(null);
  // Start restricted (fail-closed) — never show admin tabs/dashboard before
  // the real role is confirmed.
  const [role, setRole] = useState<Role>("worker");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const all = await fetchAccessibleBusinesses(user.id);
      setBusinesses(all);
      if (all.length === 0) { setActive(null); setRole("worker"); return; }

      // Try the persisted choice; fall back to first
      const persisted = await AsyncStorage.getItem(ACTIVE_KEY);
      const found = persisted ? all.find((b) => b.id === persisted) : null;
      const chosen = found ?? all[0];
      setActive(chosen);
      setRole(await fetchRoleForBusiness(user.id, chosen));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const switchTo = useCallback(async (businessId: string) => {
    const next = businesses.find((b) => b.id === businessId);
    if (!next) return;
    await AsyncStorage.setItem(ACTIVE_KEY, businessId);
    setActive(next);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setRole(await fetchRoleForBusiness(user.id, next));
  }, [businesses]);

  return { loading, businesses, active, role, switchTo, refresh: load };
}
