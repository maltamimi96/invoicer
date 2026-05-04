-- ============================================================================
-- Per-invite codes for self-service worker signup
--
-- A worker invited via Settings → Team gets a short code in their email.
-- They open Connected Hub, tap "Got an invite code?", enter their email +
-- the code + a password, and the RPC below validates the pair, creates the
-- linkage, and returns the business name so the app can confirm.
--
-- Auth user creation still happens via supabase.auth.signUp — the RPC just
-- checks the code and unlocks the right business_members row.
-- ============================================================================

ALTER TABLE public.business_members
  ADD COLUMN IF NOT EXISTS invite_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS business_members_invite_token_idx
  ON public.business_members (invite_token)
  WHERE invite_token IS NOT NULL;

-- ─── 1. Validate (no auth needed — used pre-signup to preview the biz) ────
CREATE OR REPLACE FUNCTION public.preview_invite(p_token TEXT)
RETURNS TABLE (business_id UUID, business_name TEXT, role TEXT, email TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.business_id, b.name AS business_name, m.role, m.email
  FROM   public.business_members m
  JOIN   public.businesses b ON b.id = m.business_id
  WHERE  m.invite_token = p_token
    AND  m.status        = 'pending'
    AND  m.user_id        IS NULL
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.preview_invite(TEXT) TO anon, authenticated;

-- ─── 2. Redeem (called right after auth.signUp, while logged in) ──────────
-- Activates the pending row matching the caller's email + the supplied
-- token, links it to auth.uid(), clears the token so it can't be reused.
-- Mirrors activate_pending_memberships() but additionally verifies the
-- invite_token to stop anyone with a known invited email from joining
-- before the real worker does.
CREATE OR REPLACE FUNCTION public.redeem_invite(p_token TEXT)
RETURNS TABLE (business_id UUID, role TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_uid   UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'No email on auth user';
  END IF;

  RETURN QUERY
  UPDATE public.business_members
  SET    user_id      = v_uid,
         status       = 'active',
         invite_token = NULL
  WHERE  invite_token = p_token
    AND  lower(email) = lower(v_email)
    AND  status       = 'pending'
    AND  user_id      IS NULL
  RETURNING business_id, role;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite — code does not match this email or it has already been used';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.redeem_invite(TEXT) TO authenticated;
