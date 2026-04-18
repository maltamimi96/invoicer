-- Storage bucket for captured work-order signatures (PNG blobs from canvas pad)
INSERT INTO storage.buckets (id, name, public)
VALUES ('work-order-signatures', 'work-order-signatures', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "work_order_signatures_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'work-order-signatures'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "work_order_signatures_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'work-order-signatures');

CREATE POLICY "work_order_signatures_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'work-order-signatures'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
