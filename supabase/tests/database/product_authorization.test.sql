begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(43);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'owner-one@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'owner-two@example.test');

insert into public.base_resumes (
  id,
  user_id,
  original_filename,
  storage_object_key,
  size_bytes,
  content_sha256,
  active_slot
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'owner-one.pdf',
    '00000000-0000-4000-8000-000000000001/base-resumes/owner-one.pdf',
    100,
    repeat('a', 64),
    1
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'owner-two.pdf',
    '00000000-0000-4000-8000-000000000002/base-resumes/owner-two.pdf',
    200,
    repeat('b', 64),
    1
  );

insert into public.resume_interpretations (
  id,
  user_id,
  base_resume_id,
  source_resume_sha256,
  interpreter_name,
  interpreter_version,
  schema_version,
  structured_content,
  content_sha256
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    repeat('a', 64),
    'test-interpreter',
    '1.0.0',
    1,
    '{"sections":[]}',
    repeat('c', 64)
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    repeat('b', 64),
    'test-interpreter',
    '1.0.0',
    1,
    '{"sections":[]}',
    repeat('d', 64)
  );

insert into public.applications (
  id,
  user_id,
  company,
  role,
  selected_base_resume_id
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'Owner One Co',
    'Engineer',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'Owner Two Co',
    'Engineer',
    '10000000-0000-4000-8000-000000000002'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    'Disposable Working Copy Co',
    'Engineer',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000002',
    'Other Owner Without Working Copy Co',
    'Engineer',
    '10000000-0000-4000-8000-000000000002'
  );

insert into public.working_copies (
  id,
  user_id,
  application_id,
  source_base_resume_id,
  source_interpretation_id,
  state,
  structured_content,
  content_sha256,
  change_summary,
  provider_name,
  model_name,
  prompt_version,
  source_resume_sha256,
  source_interpretation_sha256,
  accepted_at
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'accepted',
    '{"sections":[]}',
    repeat('e', 64),
    '[]',
    'test-provider',
    'test-model',
    'prompt-v1',
    repeat('a', 64),
    repeat('c', 64),
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'accepted',
    '{"sections":[]}',
    repeat('f', 64),
    '[]',
    'test-provider',
    'test-model',
    'prompt-v1',
    repeat('b', 64),
    repeat('d', 64),
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'awaiting_review',
    '{"sections":[]}',
    repeat('1', 64),
    '[]',
    'test-provider',
    'test-model',
    'prompt-v1',
    repeat('a', 64),
    repeat('c', 64),
    null
  );

insert into public.finalized_resumes (
  id,
  user_id,
  application_id,
  source_base_resume_id,
  source_resume_sha256,
  source_working_copy_id,
  source_working_copy_revision,
  source_working_copy_sha256,
  structured_content,
  content_sha256,
  pdf_storage_object_key,
  pdf_sha256,
  pdf_size_bytes,
  renderer_name,
  renderer_version
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    repeat('a', 64),
    '40000000-0000-4000-8000-000000000001',
    1,
    repeat('e', 64),
    '{"sections":[]}',
    repeat('2', 64),
    '00000000-0000-4000-8000-000000000001/finalized/owner-one.pdf',
    repeat('3', 64),
    300,
    'test-renderer',
    '1.0.0'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    repeat('b', 64),
    '40000000-0000-4000-8000-000000000002',
    1,
    repeat('f', 64),
    '{"sections":[]}',
    repeat('4', 64),
    '00000000-0000-4000-8000-000000000002/finalized/owner-two.pdf',
    repeat('5', 64),
    400,
    'test-renderer',
    '1.0.0'
  );

update public.applications
set submitted_finalized_resume_id = case id
      when '30000000-0000-4000-8000-000000000001'
        then '50000000-0000-4000-8000-000000000001'::uuid
      when '30000000-0000-4000-8000-000000000002'
        then '50000000-0000-4000-8000-000000000002'::uuid
    end
where id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002'
);

select is(
  (
    select count(*)::integer
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in (
        'base_resumes',
        'resume_interpretations',
        'applications',
        'working_copies',
        'finalized_resumes'
      )
      and pg_class.relrowsecurity
  ),
  5,
  'RLS is enabled on all five product tables'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'base_resumes',
        'resume_interpretations',
        'applications',
        'working_copies',
        'finalized_resumes'
      )
  ),
  14,
  'the product tables have only the required operation policies'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'base_resumes',
        'resume_interpretations',
        'applications',
        'working_copies',
        'finalized_resumes'
      )
      and roles <> array['authenticated']::name[]
  ),
  'every product policy targets only the authenticated role'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'base_resumes',
        'resume_interpretations',
        'applications',
        'working_copies',
        'finalized_resumes'
      )
      and coalesce(qual, with_check, '') not like '%auth.uid()%'
  ),
  'every product policy includes an auth.uid ownership predicate'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'base_resumes',
      'resume_interpretations',
      'applications',
      'working_copies',
      'finalized_resumes'
    ]) as product_table(table_name)
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      as operation(privilege_name)
    where has_table_privilege(
      'anon',
      format('public.%I', product_table.table_name),
      operation.privilege_name
    )
  ),
  'anonymous has no product-table DML grants'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'base_resumes',
      'resume_interpretations',
      'applications',
      'working_copies',
      'finalized_resumes'
    ]) as product_table(table_name)
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      as operation(privilege_name)
    where has_table_privilege(
      'service_role',
      format('public.%I', product_table.table_name),
      operation.privilege_name
    )
  ),
  'service_role has no product-table DML grants'
);

select ok(
  (
    select bool_and(
      has_table_privilege(
        'authenticated',
        format('public.%I', product_table.table_name),
        'SELECT'
      )
      and has_table_privilege(
        'authenticated',
        format('public.%I', product_table.table_name),
        'INSERT'
      )
    )
    from unnest(array[
      'base_resumes',
      'resume_interpretations',
      'applications',
      'working_copies',
      'finalized_resumes'
    ]) as product_table(table_name)
  ),
  'authenticated has select and insert grants on every product table'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.base_resumes',
    'retired_at',
    'UPDATE'
  )
  and not has_column_privilege(
    'authenticated',
    'public.base_resumes',
    'original_filename',
    'UPDATE'
  )
  and has_column_privilege(
    'authenticated',
    'public.applications',
    'status',
    'UPDATE'
  )
  and not has_column_privilege(
    'authenticated',
    'public.applications',
    'user_id',
    'UPDATE'
  )
  and has_column_privilege(
    'authenticated',
    'public.working_copies',
    'state',
    'UPDATE'
  )
  and not has_column_privilege(
    'authenticated',
    'public.working_copies',
    'application_id',
    'UPDATE'
  ),
  'authenticated update grants are limited to mutable columns'
);

select ok(
  has_table_privilege('authenticated', 'public.working_copies', 'DELETE')
  and not has_table_privilege(
    'authenticated',
    'public.base_resumes',
    'DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.resume_interpretations',
    'DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.applications',
    'DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.finalized_resumes',
    'DELETE'
  ),
  'only current working copies support authenticated deletion'
);

select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'base_resumes_user_created_at_idx',
        'resume_interpretations_user_id_idx',
        'applications_user_updated_at_idx',
        'working_copies_user_id_idx',
        'finalized_resumes_user_id_idx'
      )
  ),
  5,
  'each product table retains an ownership-leading index'
);

select ok(
  case
    when to_regprocedure('public.rls_auto_enable()') is null then true
    else
      not has_function_privilege(
        'anon',
        'public.rls_auto_enable()',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.rls_auto_enable()',
        'EXECUTE'
      )
      and not has_function_privilege(
        'service_role',
        'public.rls_auto_enable()',
        'EXECUTE'
      )
  end,
  'the hosted RLS auto-enable guard is not directly callable by API roles'
);

set local role anon;

select throws_ok(
  $$select count(*) from public.applications$$,
  '42501',
  null,
  'anonymous product reads are denied'
);

reset role;
set local request.jwt.claim.sub =
  '00000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select is(
  (select count(*)::integer from public.base_resumes),
  1,
  'an authenticated user sees only their base resumes'
);

select is(
  (select count(*)::integer from public.resume_interpretations),
  1,
  'an authenticated user sees only their resume interpretations'
);

select is(
  (select count(*)::integer from public.applications),
  2,
  'an authenticated user sees only their applications'
);

select is(
  (select count(*)::integer from public.working_copies),
  2,
  'an authenticated user sees only their working copies'
);

select is(
  (select count(*)::integer from public.finalized_resumes),
  1,
  'an authenticated user sees only their finalized resumes'
);

select is(
  (
    select count(*)::integer
    from public.base_resumes
    where id = '10000000-0000-4000-8000-000000000002'
  ),
  0,
  'another user''s base resume is hidden'
);

select is(
  (
    select count(*)::integer
    from public.resume_interpretations
    where id = '20000000-0000-4000-8000-000000000002'
  ),
  0,
  'another user''s interpretation is hidden'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where id = '30000000-0000-4000-8000-000000000002'
  ),
  0,
  'another user''s application is hidden'
);

select is(
  (
    select count(*)::integer
    from public.working_copies
    where id = '40000000-0000-4000-8000-000000000002'
  ),
  0,
  'another user''s working copy is hidden'
);

select is(
  (
    select count(*)::integer
    from public.finalized_resumes
    where id = '50000000-0000-4000-8000-000000000002'
  ),
  0,
  'another user''s finalized resume is hidden'
);

select lives_ok(
  $$
    insert into public.applications (
      user_id,
      company,
      role
    )
    values (
      '00000000-0000-4000-8000-000000000001',
      'Owned Insert Co',
      'Engineer'
    )
  $$,
  'an authenticated user can insert their own application'
);

select lives_ok(
  $$
    insert into public.base_resumes (
      user_id,
      original_filename,
      storage_object_key,
      size_bytes,
      content_sha256,
      active_slot
    )
    values (
      '00000000-0000-4000-8000-000000000001',
      'second-owned.pdf',
      '00000000-0000-4000-8000-000000000001/base-resumes/second-owned.pdf',
      500,
      repeat('6', 64),
      2
    )
  $$,
  'an authenticated user can insert their own base resume'
);

select throws_ok(
  $$
    insert into public.applications (
      user_id,
      company,
      role
    )
    values (
      '00000000-0000-4000-8000-000000000002',
      'Forged Owner Co',
      'Engineer'
    )
  $$,
  '42501',
  null,
  'an authenticated user cannot insert a row for another owner'
);

select throws_ok(
  $$
    insert into public.applications (
      user_id,
      company,
      role,
      selected_base_resume_id
    )
    values (
      '00000000-0000-4000-8000-000000000001',
      'Cross Owner Resume Co',
      'Engineer',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '23503',
  null,
  'an application cannot attach another owner''s base resume'
);

select throws_ok(
  $$
    insert into public.resume_interpretations (
      user_id,
      base_resume_id,
      source_resume_sha256,
      interpreter_name,
      interpreter_version,
      schema_version,
      structured_content,
      content_sha256
    )
    values (
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      repeat('b', 64),
      'test-interpreter',
      '2.0.0',
      1,
      '{"sections":[]}',
      repeat('7', 64)
    )
  $$,
  '23503',
  null,
  'an interpretation cannot attach another owner''s base resume'
);

select throws_ok(
  $$
    insert into public.working_copies (
      user_id,
      application_id,
      source_base_resume_id,
      source_interpretation_id,
      structured_content,
      content_sha256,
      change_summary,
      provider_name,
      model_name,
      prompt_version,
      source_resume_sha256,
      source_interpretation_sha256
    )
    values (
      '00000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '{"sections":[]}',
      repeat('8', 64),
      '[]',
      'test-provider',
      'test-model',
      'prompt-v1',
      repeat('a', 64),
      repeat('c', 64)
    )
  $$,
  '23503',
  null,
  'a working copy cannot attach another owner''s application'
);

select throws_ok(
  $$
    insert into public.finalized_resumes (
      user_id,
      application_id,
      source_base_resume_id,
      source_resume_sha256,
      source_working_copy_id,
      source_working_copy_revision,
      source_working_copy_sha256,
      structured_content,
      content_sha256,
      pdf_storage_object_key,
      pdf_sha256,
      pdf_size_bytes,
      renderer_name,
      renderer_version
    )
    values (
      '00000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      repeat('a', 64),
      '40000000-0000-4000-8000-000000000002',
      1,
      repeat('f', 64),
      '{"sections":[]}',
      repeat('9', 64),
      '00000000-0000-4000-8000-000000000001/finalized/cross-owner.pdf',
      repeat('0', 64),
      500,
      'test-renderer',
      '1.0.0'
    )
  $$,
  '23503',
  null,
  'a finalized resume cannot attach another owner''s working copy'
);

select results_eq(
  $$
    update public.base_resumes
    set active_slot = null,
        retired_at = now()
    where id = '10000000-0000-4000-8000-000000000001'
    returning 1
  $$,
  $$values (1)$$,
  'an owner can retire their active base resume'
);

select results_eq(
  $$
    update public.base_resumes
    set active_slot = null,
        retired_at = now()
    where id = '10000000-0000-4000-8000-000000000002'
    returning 1
  $$,
  $$select 1 where false$$,
  'an owner cannot retire another user''s base resume'
);

select results_eq(
  $$
    update public.applications
    set status = 'applied',
        updated_at = now()
    where id = '30000000-0000-4000-8000-000000000001'
    returning 1
  $$,
  $$values (1)$$,
  'an owner can update their application'
);

select results_eq(
  $$
    update public.applications
    set status = 'applied',
        updated_at = now()
    where id = '30000000-0000-4000-8000-000000000002'
    returning 1
  $$,
  $$select 1 where false$$,
  'an owner cannot update another user''s application'
);

select results_eq(
  $$
    update public.working_copies
    set revision_number = revision_number + 1,
        updated_at = now()
    where id = '40000000-0000-4000-8000-000000000003'
    returning 1
  $$,
  $$values (1)$$,
  'an owner can update their current working copy'
);

select results_eq(
  $$
    update public.working_copies
    set revision_number = revision_number + 1,
        updated_at = now()
    where id = '40000000-0000-4000-8000-000000000002'
    returning 1
  $$,
  $$select 1 where false$$,
  'an owner cannot update another user''s working copy'
);

select throws_ok(
  $$
    update public.applications
    set user_id = '00000000-0000-4000-8000-000000000002'
    where id = '30000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'application ownership cannot be reassigned'
);

select throws_ok(
  $$
    update public.base_resumes
    set original_filename = 'mutated.pdf'
    where id = '10000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'immutable base-resume source fields cannot be updated'
);

select throws_ok(
  $$
    update public.resume_interpretations
    set structured_content = '{"sections":["mutated"]}'
    where id = '20000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'immutable interpretations cannot be updated'
);

select throws_ok(
  $$
    update public.finalized_resumes
    set structured_content = '{"sections":["mutated"]}'
    where id = '50000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'immutable finalized resumes cannot be updated'
);

select results_eq(
  $$
    delete from public.working_copies
    where id = '40000000-0000-4000-8000-000000000002'
    returning 1
  $$,
  $$select 1 where false$$,
  'an owner cannot discard another user''s working copy'
);

select results_eq(
  $$
    delete from public.working_copies
    where id = '40000000-0000-4000-8000-000000000003'
    returning 1
  $$,
  $$values (1)$$,
  'an owner can discard their unfinalized current working copy'
);

select throws_ok(
  $$
    delete from public.working_copies
    where id = '40000000-0000-4000-8000-000000000001'
  $$,
  '23503',
  null,
  'a finalized source working copy remains protected by foreign keys'
);

select throws_ok(
  $$
    delete from public.applications
    where id = '30000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'application deletion remains unsupported'
);

reset role;

select * from finish();
rollback;
