-- A worker could set their own pay rate.
--
-- `mp_self_update` is FOR UPDATE USING (user_id = auth.uid()) — row-level only.
-- Postgres has no column restriction in an RLS policy, so once a worker was
-- allowed to update their own row at all, they could update ANY column on it,
-- including `hourly_rate`. That column is the entire timesheets pay model and
-- feeds pay runs, and the row is reachable with the anon key from the mobile
-- app: no server action involved, nothing to intercept in TypeScript.
--
-- (The WITH CHECK omission the audit flagged is not itself the hole — Postgres
-- reuses USING as the check for UPDATE, so a worker could never reassign the
-- row to someone else. The hole is that USING says nothing about columns.)
--
-- RLS can't express this, so the gate is a trigger: a worker may edit the
-- things that are theirs to describe, and nothing that decides what they are
-- paid or what they are trusted with.

-- ── Who may change the protected columns ───────────────────────────────────
-- Owner (businesses.user_id) or an active admin — matching canManageTeam() in
-- src/lib/permissions.ts exactly. `is_business_admin` already exists for this
-- and is SECURITY DEFINER, so it sees past RLS.
CREATE OR REPLACE FUNCTION public.can_manage_member_profiles(biz_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.businesses WHERE id = biz_id AND user_id = auth.uid())
    OR public.is_business_admin(biz_id, auth.uid());
$$;

COMMENT ON FUNCTION public.can_manage_member_profiles IS
  'Owner or admin — deliberately the same set as canManageTeam() in src/lib/permissions.ts. Two rules that drift apart are worse than one strict rule.';

-- ── The gate ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_member_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role has no auth.uid(). Server-side code (crons, the admin client,
  -- payroll) already does its own role checks and must not be blocked here.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.can_manage_member_profiles(NEW.business_id) THEN
    RETURN NEW;
  END IF;

  -- Everyone else: name, phone, avatar_url and bio are theirs to change.
  -- Everything below decides pay, identity or standing, and is not.
  IF NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate THEN
    RAISE EXCEPTION 'Only an owner or admin can change a pay rate'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.skills IS DISTINCT FROM OLD.skills THEN
    RAISE EXCEPTION 'Only an owner or admin can change skills'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role_title IS DISTINCT FROM OLD.role_title THEN
    RAISE EXCEPTION 'Only an owner or admin can change a job title'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Only an owner or admin can activate or deactivate a team member'
      USING ERRCODE = '42501';
  END IF;

  -- Identity. Changing any of these is how you become someone else, or move
  -- your profile into another business.
  IF NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Only an owner or admin can change profile identity'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_member_profile_columns ON public.member_profiles;
CREATE TRIGGER trg_guard_member_profile_columns
  BEFORE UPDATE ON public.member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_profile_columns();

-- ── Make the policy say what it means ──────────────────────────────────────
-- Behaviourally the same (Postgres was already using USING as the check), but
-- written out so the next reader doesn't have to know that rule to be sure.
DROP POLICY IF EXISTS "mp_self_update" ON public.member_profiles;
CREATE POLICY "mp_self_update" ON public.member_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON COLUMN public.member_profiles.hourly_rate IS
  'Pay rate. Owner/admin only — enforced by trg_guard_member_profile_columns, not by RLS, because RLS cannot restrict columns.';
