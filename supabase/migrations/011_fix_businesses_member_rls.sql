-- Allow active business members to read the business they belong to.
-- The original policy only allowed owners (auth.uid() = user_id).
-- We use a SECURITY DEFINER helper to avoid recursion (businesses policy → business_members query).

CREATE OR REPLACE FUNCTION public.is_business_member(biz_id uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = biz_id
      AND user_id     = uid
      AND status      = 'active'
  );
$$;

-- Add a second SELECT policy — existing "Users can view own business" stays for owners.
CREATE POLICY "Members can view business"
  ON public.businesses
  FOR SELECT
  USING (public.is_business_member(id, auth.uid()));
