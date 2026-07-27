create type public.working_copy_state as enum (
  'awaiting_review',
  'accepted'
);

create table public.working_copies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  source_base_resume_id uuid not null,
  source_interpretation_id uuid not null,
  state public.working_copy_state not null default 'awaiting_review',
  structured_content jsonb not null,
  content_sha256 text not null,
  change_summary jsonb not null,
  revision_number integer not null default 1,
  provider_name text not null,
  model_name text not null,
  prompt_version text not null,
  source_resume_sha256 text not null,
  source_interpretation_sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,

  constraint working_copies_user_id_fkey
    foreign key (user_id)
    references auth.users (id)
    on delete restrict,
  constraint working_copies_application_fkey
    foreign key (application_id, user_id)
    references public.applications (id, user_id)
    on delete restrict,
  constraint working_copies_base_resume_fkey
    foreign key (source_base_resume_id, user_id, source_resume_sha256)
    references public.base_resumes (id, user_id, content_sha256)
    on delete restrict,
  constraint working_copies_interpretation_fkey
    foreign key (
      source_interpretation_id,
      source_base_resume_id,
      user_id,
      source_interpretation_sha256
    )
    references public.resume_interpretations (
      id,
      base_resume_id,
      user_id,
      content_sha256
    )
    on delete restrict,
  constraint working_copies_application_id_key
    unique (application_id),
  constraint working_copies_id_user_id_key
    unique (id, user_id),
  constraint working_copies_finalization_source_key
    unique (
      id,
      application_id,
      user_id,
      source_base_resume_id,
      source_resume_sha256
    ),
  constraint working_copies_structured_content_check
    check (jsonb_typeof(structured_content) = 'object'),
  constraint working_copies_change_summary_check
    check (jsonb_typeof(change_summary) in ('array', 'object')),
  constraint working_copies_revision_number_check
    check (revision_number >= 1),
  constraint working_copies_provider_name_check
    check (length(btrim(provider_name)) > 0),
  constraint working_copies_model_name_check
    check (length(btrim(model_name)) > 0),
  constraint working_copies_prompt_version_check
    check (length(btrim(prompt_version)) > 0),
  constraint working_copies_content_sha256_check
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint working_copies_source_resume_sha256_check
    check (source_resume_sha256 ~ '^[0-9a-f]{64}$'),
  constraint working_copies_source_interpretation_sha256_check
    check (source_interpretation_sha256 ~ '^[0-9a-f]{64}$'),
  constraint working_copies_state_timestamps_check
    check (
      (state = 'awaiting_review' and accepted_at is null)
      or (state = 'accepted' and accepted_at is not null)
    ),
  constraint working_copies_updated_at_check
    check (updated_at >= created_at),
  constraint working_copies_accepted_at_check
    check (accepted_at is null or accepted_at >= created_at)
);

create index working_copies_user_id_idx
  on public.working_copies (user_id);

create index working_copies_source_base_resume_idx
  on public.working_copies (
    source_base_resume_id,
    user_id,
    source_resume_sha256
  );

create index working_copies_source_interpretation_idx
  on public.working_copies (
    source_interpretation_id,
    source_base_resume_id,
    user_id,
    source_interpretation_sha256
  );

create index working_copies_ready_for_review_idx
  on public.working_copies (user_id, updated_at desc, id desc)
  where state = 'awaiting_review';
