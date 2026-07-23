-- Public bucket for document-template assets (background/letterhead images,
-- watermark logos). Public-read so the @react-pdf renderer and the customer
-- portal can fetch them by URL, exactly like business logos. Writes are limited
-- to authenticated users, namespaced by business_id as the first path segment.

INSERT INTO storage.buckets (id, name, public)
VALUES ('document-assets', 'document-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read.
DROP POLICY IF EXISTS "document_assets_public_read" ON storage.objects;
CREATE POLICY "document_assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'document-assets');

-- Authenticated write into a business the user can manage (owner/admin/editor).
-- The first path segment must be that business_id.
DROP POLICY IF EXISTS "document_assets_write" ON storage.objects;
CREATE POLICY "document_assets_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'document-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id::text FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin','editor')
    )
  );

DROP POLICY IF EXISTS "document_assets_delete" ON storage.objects;
CREATE POLICY "document_assets_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'document-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id::text FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin','editor')
    )
  );
