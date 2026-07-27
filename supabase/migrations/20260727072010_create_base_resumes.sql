create table public.base_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  original_filename text not null,
  storage_object_key text not null,
  content_type text not null default 'application/pdf',
  size_bytes bigint not null,
  content_sha256 text not null,
  active_slot smallint,
  created_at timestamptz not null default now(),
  retired_at timestamptz,

  constraint base_resumes_user_id_fkey
    foreign key (user_id)
    references auth.users (id)
    on delete restrict,
  constraint base_resumes_id_user_id_key
    unique (id, user_id),
  constraint base_resumes_source_identity_key
    unique (id, user_id, content_sha256),
  constraint base_resumes_storage_object_key_key
    unique (storage_object_key),
  constraint base_resumes_original_filename_check
    check (length(btrim(original_filename)) > 0),
  constraint base_resumes_storage_object_key_check
    check (
      length(storage_object_key) > 0
      and storage_object_key = btrim(storage_object_key)
      and storage_object_key !~* '^[a-z][a-z0-9+.-]*://'
    ),
  constraint base_resumes_content_type_check
    check (content_type = 'application/pdf'),
  constraint base_resumes_size_bytes_check
    check (size_bytes > 0),
  constraint base_resumes_content_sha256_check
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint base_resumes_active_slot_check
    check (active_slot is null or active_slot between 1 and 3),
  constraint base_resumes_active_lifecycle_check
    check (
      (active_slot is not null and retired_at is null)
      or (active_slot is null and retired_at is not null)
    ),
  constraint base_resumes_retired_at_check
    check (retired_at is null or retired_at >= created_at)
);

create unique index base_resumes_user_active_slot_key
  on public.base_resumes (user_id, active_slot)
  where active_slot is not null;

create index base_resumes_user_active_created_at_idx
  on public.base_resumes (user_id, created_at desc, id desc)
  where active_slot is not null;

create index base_resumes_user_created_at_idx
  on public.base_resumes (user_id, created_at desc, id desc);
