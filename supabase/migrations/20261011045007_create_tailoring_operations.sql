create table public.tailoring_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  created_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,

  constraint tailoring_operations_user_id_fkey
    foreign key (user_id)
    references auth.users (id)
    on delete restrict,
  constraint tailoring_operations_application_fkey
    foreign key (application_id, user_id)
    references public.applications (id, user_id)
    on delete cascade,
  constraint tailoring_operations_application_id_key
    unique (application_id),
  constraint tailoring_operations_lease_duration_check
    check (
      lease_expires_at > created_at
      and lease_expires_at <= created_at + interval '5 minutes'
    )
);

create index tailoring_operations_user_lease_expires_at_idx
  on public.tailoring_operations (user_id, lease_expires_at);

alter table public.tailoring_operations enable row level security;

revoke all privileges on table public.tailoring_operations
  from anon, authenticated, service_role;

grant select, insert, delete on table public.tailoring_operations
  to authenticated;
grant update (lease_expires_at)
  on table public.tailoring_operations
  to authenticated;

create policy tailoring_operations_select_own
  on public.tailoring_operations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy tailoring_operations_insert_own
  on public.tailoring_operations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy tailoring_operations_update_own
  on public.tailoring_operations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy tailoring_operations_delete_own
  on public.tailoring_operations
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
