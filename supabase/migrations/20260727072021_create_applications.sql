create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company text not null,
  role text not null,
  job_description text,
  posting_url text,
  notes text,
  status text not null default 'draft',
  applied_on date,
  selected_base_resume_id uuid,
  submitted_finalized_resume_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint applications_user_id_fkey
    foreign key (user_id)
    references auth.users (id)
    on delete restrict,
  constraint applications_selected_base_resume_fkey
    foreign key (selected_base_resume_id, user_id)
    references public.base_resumes (id, user_id)
    on delete restrict,
  constraint applications_id_user_id_key
    unique (id, user_id),
  constraint applications_company_check
    check (length(btrim(company)) > 0),
  constraint applications_role_check
    check (length(btrim(role)) > 0),
  constraint applications_job_description_check
    check (
      job_description is null
      or length(btrim(job_description)) > 0
    ),
  constraint applications_posting_url_check
    check (posting_url is null or length(btrim(posting_url)) > 0),
  constraint applications_status_check
    check (
      status in (
        'draft',
        'applied',
        'interviewing',
        'offer',
        'rejected',
        'withdrawn'
      )
    ),
  constraint applications_updated_at_check
    check (updated_at >= created_at)
);

create index applications_user_status_idx
  on public.applications (user_id, status);

create index applications_user_updated_at_idx
  on public.applications (user_id, updated_at desc, id desc);

create index applications_selected_base_resume_idx
  on public.applications (selected_base_resume_id, user_id)
  where selected_base_resume_id is not null;
