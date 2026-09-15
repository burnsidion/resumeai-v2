alter table public.applications
  drop constraint applications_submitted_finalized_resume_fkey;

alter table public.applications
  add constraint applications_submitted_finalized_resume_fkey
  foreign key (submitted_finalized_resume_id, id, user_id)
  references public.finalized_resumes (id, application_id, user_id)
  on delete set null (submitted_finalized_resume_id);

alter table public.working_copies
  drop constraint working_copies_application_fkey;

alter table public.working_copies
  add constraint working_copies_application_fkey
  foreign key (application_id, user_id)
  references public.applications (id, user_id)
  on delete cascade;

alter table public.finalized_resumes
  drop constraint finalized_resumes_application_fkey;

alter table public.finalized_resumes
  add constraint finalized_resumes_application_fkey
  foreign key (application_id, user_id)
  references public.applications (id, user_id)
  on delete cascade;

alter table public.finalized_resumes
  drop constraint finalized_resumes_working_copy_fkey;

alter table public.finalized_resumes
  add constraint finalized_resumes_working_copy_fkey
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
  on delete no action
  deferrable initially deferred;

grant delete on table public.applications to authenticated;

create policy applications_delete_own
  on public.applications
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
