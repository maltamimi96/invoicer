-- Per-business navigation: rename, reorder, hide.
--
-- The industry preset already supplied a `vocab` map (Work Orders → Projects
-- for an agency), but it was fixed at the preset and consumed only by the
-- sidebar. This makes it the business's own, and extends it past the nav.
--
-- NULL = use the preset, exactly like customer_field_schema. That keeps every
-- existing business on today's behaviour until they change something, and
-- means improvements to a preset keep flowing until they don't want them to.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS nav_config JSONB;

COMMENT ON COLUMN public.businesses.nav_config IS
  'Navigation overrides: {"labels":{"/work-orders":"Projects"},"hidden":["/tasks"],"order":["/dashboard",...]}. NULL = the industry preset''s vocab.';
