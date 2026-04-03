-- ============================================================
-- STORAGE: logos bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload into their own folder
create policy "Users can upload logos"
  on storage.objects for insert
  with check (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);

-- Logos are publicly readable (needed for PDFs and invoice previews)
create policy "Logos are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'logos');

-- Allow users to overwrite/update their own logos
create policy "Users can update their logos"
  on storage.objects for update
  using (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own logos
create policy "Users can delete their logos"
  on storage.objects for delete
  using (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);
