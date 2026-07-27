begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

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
    'resume-one.pdf',
    '00000000-0000-4000-8000-000000000001/base-resumes/one.pdf',
    100,
    repeat('a', 64),
    1
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    'resume-two.pdf',
    '00000000-0000-4000-8000-000000000001/base-resumes/two.pdf',
    200,
    repeat('b', 64),
    2
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    'resume-three.pdf',
    '00000000-0000-4000-8000-000000000001/base-resumes/three.pdf',
    300,
    repeat('c', 64),
    3
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000002',
    'other-owner.pdf',
    '00000000-0000-4000-8000-000000000002/base-resumes/one.pdf',
    400,
    repeat('e', 64),
    1
  );

select throws_ok(
  $$
    insert into public.base_resumes (
      id,
      user_id,
      original_filename,
      storage_object_key,
      size_bytes,
      content_sha256,
      active_slot
    )
    values (
      '10000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000001',
      'too-many.pdf',
      '00000000-0000-4000-8000-000000000001/base-resumes/too-many.pdf',
      500,
      repeat('d', 64),
      1
    )
  $$,
  '23505',
  null,
  'a user cannot occupy an active resume slot twice'
);

update public.base_resumes
set active_slot = null,
    retired_at = now()
where id = '10000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    insert into public.base_resumes (
      id,
      user_id,
      original_filename,
      storage_object_key,
      size_bytes,
      content_sha256,
      active_slot
    )
    values (
      '10000000-0000-4000-8000-000000000006',
      '00000000-0000-4000-8000-000000000001',
      'replacement.pdf',
      '00000000-0000-4000-8000-000000000001/base-resumes/replacement.pdf',
      600,
      repeat('d', 64),
      1
    )
  $$,
  'a retired resume frees its active slot for a replacement row'
);

select throws_ok(
  $$
    insert into public.base_resumes (
      id,
      user_id,
      original_filename,
      storage_object_key,
      size_bytes,
      content_sha256,
      active_slot
    )
    values (
      '10000000-0000-4000-8000-000000000007',
      '00000000-0000-4000-8000-000000000002',
      'public-url.pdf',
      'https://example.test/public-resume.pdf',
      700,
      repeat('d', 64),
      2
    )
  $$,
  '23514',
  null,
  'a base resume stores a private object key rather than a public URL'
);

select throws_ok(
  $$
    insert into public.applications (
      user_id,
      company,
      role,
      status
    )
    values (
      '00000000-0000-4000-8000-000000000001',
      'Invalid Status Co',
      'Engineer',
      'screening'
    )
  $$,
  '23514',
  null,
  'application status rejects values outside the approved vocabulary'
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
      'Wrong Owner Co',
      'Engineer',
      '10000000-0000-4000-8000-000000000004'
    )
  $$,
  '23503',
  null,
  'an application cannot select another user''s base resume'
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
values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  repeat('b', 64),
  'test-interpreter',
  '1.0.0',
  1,
  '{"sections":[]}',
  repeat('f', 64)
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
      repeat('c', 64),
      'test-interpreter',
      '1.0.1',
      1,
      '{"sections":[]}',
      repeat('1', 64)
    )
  $$,
  '23503',
  null,
  'an interpretation must identify the exact source resume content'
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
    'Application One Co',
    'Engineer',
    '10000000-0000-4000-8000-000000000002'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    'Application Two Co',
    'Senior Engineer',
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
  revision_number,
  provider_name,
  model_name,
  prompt_version,
  source_resume_sha256,
  source_interpretation_sha256,
  accepted_at
)
values (
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  'accepted',
  '{"sections":[]}',
  repeat('1', 64),
  '[]',
  2,
  'test-provider',
  'test-model',
  'prompt-v1',
  repeat('b', 64),
  repeat('f', 64),
  now()
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
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000001',
      '{"sections":[]}',
      repeat('2', 64),
      '[]',
      'test-provider',
      'test-model',
      'prompt-v1',
      repeat('b', 64),
      repeat('f', 64)
    )
  $$,
  '23505',
  null,
  'an application cannot have a second current working copy'
);

select throws_ok(
  $$
    insert into public.working_copies (
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
      source_interpretation_sha256
    )
    values (
      '00000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000001',
      'accepted',
      '{"sections":[]}',
      repeat('2', 64),
      '[]',
      'test-provider',
      'test-model',
      'prompt-v1',
      repeat('b', 64),
      repeat('f', 64)
    )
  $$,
  '23514',
  null,
  'an accepted working copy requires an acceptance timestamp'
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
  revision_number,
  provider_name,
  model_name,
  prompt_version,
  source_resume_sha256,
  source_interpretation_sha256,
  accepted_at
)
values (
  '40000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  'accepted',
  '{"sections":[]}',
  repeat('2', 64),
  '[]',
  1,
  'test-provider',
  'test-model',
  'prompt-v1',
  repeat('b', 64),
  repeat('f', 64),
  now()
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
      '10000000-0000-4000-8000-000000000002',
      repeat('b', 64),
      '40000000-0000-4000-8000-000000000002',
      1,
      repeat('2', 64),
      '{"sections":[]}',
      repeat('3', 64),
      '00000000-0000-4000-8000-000000000001/finalized/wrong.pdf',
      repeat('4', 64),
      700,
      'test-renderer',
      '1.0.0'
    )
  $$,
  '23503',
  null,
  'a finalized resume must use a working copy from the same application'
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
    '10000000-0000-4000-8000-000000000002',
    repeat('b', 64),
    '40000000-0000-4000-8000-000000000001',
    2,
    repeat('1', 64),
    '{"sections":[]}',
    repeat('3', 64),
    '00000000-0000-4000-8000-000000000001/finalized/one.pdf',
    repeat('4', 64),
    800,
    'test-renderer',
    '1.0.0'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    repeat('b', 64),
    '40000000-0000-4000-8000-000000000002',
    1,
    repeat('2', 64),
    '{"sections":[]}',
    repeat('5', 64),
    '00000000-0000-4000-8000-000000000001/finalized/two.pdf',
    repeat('6', 64),
    900,
    'test-renderer',
    '1.0.0'
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
      '10000000-0000-4000-8000-000000000002',
      repeat('b', 64),
      '40000000-0000-4000-8000-000000000001',
      2,
      repeat('1', 64),
      '{"sections":[]}',
      repeat('7', 64),
      'https://example.test/public-finalized-resume.pdf',
      repeat('8', 64),
      1000,
      'test-renderer',
      '1.0.0'
    )
  $$,
  '23514',
  null,
  'a finalized resume stores a private object key rather than a public URL'
);

select throws_ok(
  $$
    update public.applications
    set submitted_finalized_resume_id =
      '50000000-0000-4000-8000-000000000002'
    where id = '30000000-0000-4000-8000-000000000001'
  $$,
  '23503',
  null,
  'an application cannot designate another application''s finalized resume'
);

select lives_ok(
  $$
    update public.applications
    set submitted_finalized_resume_id =
      '50000000-0000-4000-8000-000000000001'
    where id = '30000000-0000-4000-8000-000000000001'
  $$,
  'an application can designate its own exact finalized resume'
);

select * from finish();
rollback;
