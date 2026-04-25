-- Job types: per-business catalog of reusable job templates.
-- Each job type carries default duration, price, color, and a checklist
-- that gets copied onto a work order when one is created from this type.

CREATE TABLE public.job_types (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id              UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name                     TEXT        NOT NULL,
  description              TEXT,
  color                    TEXT        NOT NULL DEFAULT '#3b82f6',
  default_duration_minutes INTEGER     NOT NULL DEFAULT 60 CHECK (default_duration_minutes > 0),
  default_price            NUMERIC(12,2),
  default_checklist        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  is_active                BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, name)
);

CREATE INDEX job_types_business_id_idx ON public.job_types (business_id) WHERE is_active;

CREATE TRIGGER handle_updated_at_job_types
  BEFORE UPDATE ON public.job_types
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.job_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_types_all" ON public.job_types
  FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ));

-- Optional reference from work_orders so jobs created from a type stay linked
-- (nullable: existing work orders aren't tied to a type, and a type can be
-- deleted without cascading work orders).
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS job_type_id UUID REFERENCES public.job_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS work_orders_job_type_id_idx ON public.work_orders (job_type_id);
