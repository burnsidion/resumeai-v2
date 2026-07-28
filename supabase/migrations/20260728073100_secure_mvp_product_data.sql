alter table public.base_resumes enable row level security;
alter table public.resume_interpretations enable row level security;
alter table public.applications enable row level security;
alter table public.working_copies enable row level security;
alter table public.finalized_resumes enable row level security;

revoke all privileges on table public.base_resumes
  from anon, authenticated, service_role;
revoke all privileges on table public.resume_interpretations
  from anon, authenticated, service_role;
revoke all privileges on table public.applications
  from anon, authenticated, service_role;
revoke all privileges on table public.working_copies
  from anon, authenticated, service_role;
revoke all privileges on table public.finalized_resumes
  from anon, authenticated, service_role;

grant select, insert on table public.base_resumes to authenticated;
grant update (active_slot, retired_at)
  on table public.base_resumes
  to authenticated;

grant select, insert
  on table public.resume_interpretations
  to authenticated;

grant select, insert on table public.applications to authenticated;
grant update (
  company,
  role,
  job_description,
  posting_url,
  notes,
  status,
  applied_on,
  selected_base_resume_id,
  submitted_finalized_resume_id,
  updated_at
)
  on table public.applications
  to authenticated;

grant select, insert, delete on table public.working_copies to authenticated;
grant update (
  source_base_resume_id,
  source_interpretation_id,
  state,
  structured_content,
  content_sha256,
  change_summary,
  revision_number,
  provider_name,
  model_name,
  prompt_version,
  source_resume_sha256,
  source_interpretation_sha256,
  updated_at,
  accepted_at
)
  on table public.working_copies
  to authenticated;

grant select, insert on table public.finalized_resumes to authenticated;

create policy base_resumes_select_own
  on public.base_resumes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy base_resumes_insert_own
  on public.base_resumes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy base_resumes_update_own
  on public.base_resumes
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy resume_interpretations_select_own
  on public.resume_interpretations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy resume_interpretations_insert_own
  on public.resume_interpretations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy applications_select_own
  on public.applications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy applications_insert_own
  on public.applications
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy applications_update_own
  on public.applications
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy working_copies_select_own
  on public.working_copies
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy working_copies_insert_own
  on public.working_copies
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy working_copies_update_own
  on public.working_copies
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy working_copies_delete_own
  on public.working_copies
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy finalized_resumes_select_own
  on public.finalized_resumes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy finalized_resumes_insert_own
  on public.finalized_resumes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
