begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

select has_table('storage', 'objects', 'storage objects exists');

select is(
  (
    select count(*)::integer
    from storage.buckets
    where id = 'base-resumes'
      and name = 'base-resumes'
  ),
  1,
  'the base-resumes bucket exists'
);

select is(
  (select public from storage.buckets where id = 'base-resumes'),
  false,
  'the base-resumes bucket is private'
);

select is(
  (select file_size_limit from storage.buckets where id = 'base-resumes'),
  10485760::bigint,
  'the base-resumes bucket limits objects to 10 MiB'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'base-resumes'),
  array['application/pdf']::text[],
  'the base-resumes bucket allows only PDF content types'
);

select is(
  (
    select relrowsecurity
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'storage'
      and pg_class.relname = 'objects'
  ),
  true,
  'storage objects has RLS enabled'
);

select ok(
  has_table_privilege('authenticated', 'storage.objects', 'SELECT'),
  'authenticated may select permitted storage objects'
);

select ok(
  has_table_privilege('authenticated', 'storage.objects', 'INSERT'),
  'authenticated may insert permitted storage objects'
);

select ok(
  has_table_privilege('authenticated', 'storage.objects', 'DELETE'),
  'authenticated may delete permitted untracked storage objects'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'base_resume_objects_%'
  ),
  3,
  'base-resume storage has only the three required policies'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'base_resume_objects_%'
      and roles <> array['authenticated']::name[]
  ),
  'every base-resume storage policy targets authenticated only'
);

select is(
  (
    select string_agg(cmd, ',' order by cmd)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'base_resume_objects_%'
  ),
  'DELETE,INSERT,SELECT',
  'base-resume storage permits no update policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'base_resume_objects_delete_untracked_own'
      and qual like '%base_resumes%'
  ),
  'delete policy protects objects tracked by base-resume rows'
);

select * from finish();
rollback;
