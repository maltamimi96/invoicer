insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', true)
on conflict (id) do nothing;

create policy "Users can upload report images"
  on storage.objects for insert
  with check (
    bucket_id = 'report-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Report images are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'report-images');

create policy "Users can delete their report images"
  on storage.objects for delete
  using (
    bucket_id = 'report-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
