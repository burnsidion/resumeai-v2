drop policy base_resumes_update_own
  on public.base_resumes;

create policy base_resumes_retire_own
  on public.base_resumes
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and active_slot is not null
    and retired_at is null
  )
  with check (
    (select auth.uid()) = user_id
    and active_slot is null
    and retired_at is not null
  );
