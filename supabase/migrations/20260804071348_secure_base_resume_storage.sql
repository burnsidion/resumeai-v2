alter table public.base_resumes
  drop constraint base_resumes_storage_object_key_check;

alter table public.base_resumes
  add constraint base_resumes_storage_object_key_check
  check (
    storage_object_key = user_id::text || '/' || id::text || '.pdf'
  );

create policy base_resume_objects_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'base-resumes'
    and owner_id = (select auth.uid()::text)
    and cardinality(storage.foldername(name)) = 1
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  );

create policy base_resume_objects_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'base-resumes'
    and owner_id = (select auth.uid()::text)
    and cardinality(storage.foldername(name)) = 1
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  );

create policy base_resume_objects_delete_untracked_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'base-resumes'
    and owner_id = (select auth.uid()::text)
    and cardinality(storage.foldername(name)) = 1
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
    and not exists (
      select 1
      from public.base_resumes as base_resume
      where base_resume.user_id = (select auth.uid())
        and base_resume.storage_object_key = storage.objects.name
    )
  );
