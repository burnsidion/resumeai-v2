# Base Resume Storage

## Ownership boundary

Supabase Storage holds immutable base-resume PDFs in the private
`base-resumes` bucket. Repository configuration owns the bucket definition, and
the OWL-25 migration owns the database object-key constraint and Storage RLS
policies.

The browser must not upload directly to Storage as an alternative to the Nuxt
server workflow. A later upload use case will authenticate the request, perform
deterministic file validation, coordinate Storage with the `base_resumes` row,
and translate provider failures into safe application errors. OWL-25 establishes
and verifies the provider security boundary only.

No service-role or secret key is used. Storage requests execute with the
authenticated user's JWT so the same ownership policies apply locally and in
the hosted project.

## Bucket contract

The bucket is declared in `supabase/config.toml` with this contract:

- bucket ID: `base-resumes`;
- private access;
- maximum object size: 10 MiB;
- allowed content type: `application/pdf`.

Private objects do not have durable public URLs. Future download behavior must
use an authenticated request or a deliberately short-lived signed URL without
persisting that URL as product data.

The content-type restriction validates upload metadata; it does not prove that
the bytes are a valid PDF. The future server upload use case must also reject an
empty file, validate the PDF signature and supported structure, enforce the
same size boundary before provider work, and calculate the persisted content
hash.

## Object identity

Every object key is deterministic:

```text
{authenticated-user-id}/{base-resume-id}.pdf
```

The user ID and base-resume ID are UUIDs. Additional folders, arbitrary
filenames, URLs, and keys belonging to another user are rejected by Storage
RLS. The `base_resumes` check constraint independently requires its
`storage_object_key` to contain that row's exact `user_id` and `id`.

Object replacement is unsupported. There is no Storage UPDATE policy, and
uploads must use `upsert: false`. Replacing an active base resume creates a new
row and object identity; retiring the old row does not make its source PDF
mutable or deletable.

## Access and cleanup rules

The three repository-controlled policies on `storage.objects` allow an
authenticated user to:

- upload a new PDF only beneath their exact one-level namespace;
- read only an object they own in that namespace;
- delete only an object they own that has no matching `base_resumes` row.

The DELETE policy exists solely for compensating cleanup. The intended future
write sequence is:

1. Generate the base-resume ID and deterministic object key.
2. Validate and upload the new object without upsert.
3. Insert the matching `base_resumes` row.
4. If the insert fails, remove the still-untracked object.

Once the database row exists, the PDF is durable. Active, retired, and
historically referenced base-resume objects cannot be deleted through the
authenticated Storage API. Deleting a database row to bypass this boundary is
not part of the MVP lifecycle.

Supabase can return an empty successful result when an RLS-protected deletion
matches no visible object. Application code must not interpret that response as
proof that a protected object was removed. The OWL-25 integration tests verify
the resulting object state.

## Local verification

Start the isolated stack and rebuild it from repository configuration and
migrations:

```sh
pnpm exec supabase start
pnpm exec supabase db reset --local --no-seed
```

Run the catalog, authorization, and real Storage API tests:

```sh
pnpm test:database

NUXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_with_local_value \
pnpm test:integration
```

Always remove the disposable users, emails, database rows, and objects:

```sh
pnpm exec supabase stop --no-backup
```

The integration configuration rejects non-loopback Supabase URLs. Never run the
disposable Storage tests against the hosted project.

## Hosted synchronization

Hosted changes use the linked Supabase CLI only after local validation and team
approval. Apply repository migrations first, then reconcile only the declared
Storage buckets:

```sh
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
pnpm exec supabase seed buckets --linked
```

Do not use `supabase config push` merely to provision this bucket. That command
can also apply unrelated hosted Auth configuration from the local test setup.

Verify hosted parity without uploading real documents or creating test users:

- migration history contains the OWL-25 migration;
- `base-resumes` is private with the 10 MiB and PDF restrictions;
- `storage.objects` has SELECT, INSERT, and cleanup-only DELETE policies for
  `authenticated`;
- no base-resume UPDATE policy exists;
- `base_resumes.storage_object_key` enforces the deterministic key and remains
  unique.

Hosted object operations will be exercised through the real application flow
in a later upload ticket, not by retaining disposable production data.
