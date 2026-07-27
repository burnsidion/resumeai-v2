begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select has_table('public', 'base_resumes', 'base_resumes exists');
select has_table(
  'public',
  'resume_interpretations',
  'resume_interpretations exists'
);
select has_table('public', 'applications', 'applications exists');
select has_table('public', 'working_copies', 'working_copies exists');
select has_table('public', 'finalized_resumes', 'finalized_resumes exists');
select hasnt_table('public', 'profiles', 'profiles remains outside the product schema');

select is(
  (
    select string_agg(enum_value.enumlabel, ',' order by enum_value.enumsortorder)
    from pg_type
    join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    join pg_enum as enum_value on enum_value.enumtypid = pg_type.oid
    where pg_namespace.nspname = 'public'
      and pg_type.typname = 'working_copy_state'
  ),
  'awaiting_review,accepted',
  'working_copy_state has only the approved ordered values'
);

select is(
  (
    select columns.data_type
    from information_schema.columns
    where columns.table_schema = 'public'
      and columns.table_name = 'applications'
      and columns.column_name = 'status'
  ),
  'text',
  'application status remains constrained text'
);

select is(
  (
    select columns.udt_schema || '.' || columns.udt_name
    from information_schema.columns
    where columns.table_schema = 'public'
      and columns.table_name = 'working_copies'
      and columns.column_name = 'state'
  ),
  'public.working_copy_state',
  'working-copy state uses the approved PostgreSQL enum'
);

select has_pk('public', 'base_resumes', 'base_resumes has a primary key');
select has_pk(
  'public',
  'resume_interpretations',
  'resume_interpretations has a primary key'
);
select has_pk('public', 'applications', 'applications has a primary key');
select has_pk('public', 'working_copies', 'working_copies has a primary key');
select has_pk(
  'public',
  'finalized_resumes',
  'finalized_resumes has a primary key'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'applications_status_check'
      and conrelid = 'public.applications'::regclass
  ),
  'applications has the closed-vocabulary status constraint'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'base_resumes_user_active_slot_key'
      and indexdef ilike '%unique%'
      and indexdef ilike '%where (active_slot is not null)%'
  ),
  'base resumes enforce one active row per user and slot'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'working_copies_application_id_key'
      and conrelid = 'public.working_copies'::regclass
  ),
  'an application can have at most one current working copy'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'applications_submitted_finalized_resume_fkey'
      and conrelid = 'public.applications'::regclass
  ),
  'an application can reference an exact finalized submission artifact'
);

select * from finish();
rollback;
