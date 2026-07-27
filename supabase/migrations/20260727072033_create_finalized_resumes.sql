create table public.finalized_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  source_base_resume_id uuid not null,
  source_resume_sha256 text not null,
  source_working_copy_id uuid not null,
  source_working_copy_revision integer not null,
  source_working_copy_sha256 text not null,
  structured_content jsonb not null,
  content_sha256 text not null,
  pdf_storage_object_key text not null,
  pdf_sha256 text not null,
  pdf_size_bytes bigint not null,
  renderer_name text not null,
  renderer_version text not null,
  created_at timestamptz not null default now(),

  constraint finalized_resumes_user_id_fkey
    foreign key (user_id)
    references auth.users (id)
    on delete restrict,
  constraint finalized_resumes_application_fkey
    foreign key (application_id, user_id)
    references public.applications (id, user_id)
    on delete restrict,
  constraint finalized_resumes_base_resume_fkey
    foreign key (source_base_resume_id, user_id, source_resume_sha256)
    references public.base_resumes (id, user_id, content_sha256)
    on delete restrict,
  constraint finalized_resumes_working_copy_fkey
    foreign key (
      source_working_copy_id,
      application_id,
      user_id,
      source_base_resume_id,
      source_resume_sha256
    )
    references public.working_copies (
      id,
      application_id,
      user_id,
      source_base_resume_id,
      source_resume_sha256
    )
    on delete restrict,
  constraint finalized_resumes_id_user_id_key
    unique (id, user_id),
  constraint finalized_resumes_application_identity_key
    unique (id, application_id, user_id),
  constraint finalized_resumes_pdf_storage_object_key_key
    unique (pdf_storage_object_key),
  constraint finalized_resumes_source_working_copy_revision_check
    check (source_working_copy_revision >= 1),
  constraint finalized_resumes_structured_content_check
    check (jsonb_typeof(structured_content) = 'object'),
  constraint finalized_resumes_source_resume_sha256_check
    check (source_resume_sha256 ~ '^[0-9a-f]{64}$'),
  constraint finalized_resumes_source_working_copy_sha256_check
    check (source_working_copy_sha256 ~ '^[0-9a-f]{64}$'),
  constraint finalized_resumes_content_sha256_check
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint finalized_resumes_pdf_storage_object_key_check
    check (
      length(pdf_storage_object_key) > 0
      and pdf_storage_object_key = btrim(pdf_storage_object_key)
      and pdf_storage_object_key !~* '^[a-z][a-z0-9+.-]*://'
    ),
  constraint finalized_resumes_pdf_sha256_check
    check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  constraint finalized_resumes_pdf_size_bytes_check
    check (pdf_size_bytes > 0),
  constraint finalized_resumes_renderer_name_check
    check (length(btrim(renderer_name)) > 0),
  constraint finalized_resumes_renderer_version_check
    check (length(btrim(renderer_version)) > 0)
);

create index finalized_resumes_user_id_idx
  on public.finalized_resumes (user_id);

create index finalized_resumes_application_created_at_idx
  on public.finalized_resumes (application_id, created_at desc, id desc);

create index finalized_resumes_source_base_resume_idx
  on public.finalized_resumes (
    source_base_resume_id,
    user_id,
    source_resume_sha256
  );

create index finalized_resumes_source_working_copy_idx
  on public.finalized_resumes (
    source_working_copy_id,
    application_id,
    user_id,
    source_base_resume_id,
    source_resume_sha256
  );

alter table public.applications
  add constraint applications_submitted_finalized_resume_fkey
  foreign key (submitted_finalized_resume_id, id, user_id)
  references public.finalized_resumes (id, application_id, user_id)
  on delete restrict;

create index applications_submitted_finalized_resume_idx
  on public.applications (submitted_finalized_resume_id, id, user_id)
  where submitted_finalized_resume_id is not null;
