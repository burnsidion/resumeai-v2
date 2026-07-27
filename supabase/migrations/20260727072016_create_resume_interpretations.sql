create table public.resume_interpretations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  base_resume_id uuid not null,
  source_resume_sha256 text not null,
  interpreter_name text not null,
  interpreter_version text not null,
  schema_version integer not null,
  structured_content jsonb not null,
  content_sha256 text not null,
  created_at timestamptz not null default now(),

  constraint resume_interpretations_user_id_fkey
    foreign key (user_id)
    references auth.users (id)
    on delete restrict,
  constraint resume_interpretations_base_resume_fkey
    foreign key (base_resume_id, user_id, source_resume_sha256)
    references public.base_resumes (id, user_id, content_sha256)
    on delete restrict,
  constraint resume_interpretations_id_user_id_key
    unique (id, user_id),
  constraint resume_interpretations_source_key
    unique (id, base_resume_id, user_id, content_sha256),
  constraint resume_interpretations_version_key
    unique (
      base_resume_id,
      source_resume_sha256,
      interpreter_name,
      interpreter_version,
      schema_version
    ),
  constraint resume_interpretations_interpreter_name_check
    check (length(btrim(interpreter_name)) > 0),
  constraint resume_interpretations_interpreter_version_check
    check (length(btrim(interpreter_version)) > 0),
  constraint resume_interpretations_schema_version_check
    check (schema_version >= 1),
  constraint resume_interpretations_structured_content_check
    check (jsonb_typeof(structured_content) = 'object'),
  constraint resume_interpretations_source_resume_sha256_check
    check (source_resume_sha256 ~ '^[0-9a-f]{64}$'),
  constraint resume_interpretations_content_sha256_check
    check (content_sha256 ~ '^[0-9a-f]{64}$')
);

create index resume_interpretations_user_id_idx
  on public.resume_interpretations (user_id);

create index resume_interpretations_base_resume_created_at_idx
  on public.resume_interpretations (base_resume_id, created_at desc, id desc);
