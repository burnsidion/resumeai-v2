# Base Resume Storage

## Ownership boundary

Supabase Storage holds immutable base-resume PDFs in the private
`base-resumes` bucket. Repository configuration owns the bucket definition, and
the OWL-25 migration owns the database object-key constraint and Storage RLS
policies. OWL-26 owns the trusted Nuxt upload workflow that coordinates this
bucket with the matching `base_resumes` row.

The browser must send uploads through the Nuxt server rather than uploading
directly to Storage. The server authenticates the request, performs deterministic
file validation, coordinates Storage with the `base_resumes` row, and translates
provider failures into safe application errors.

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
the bytes are a valid PDF. The server upload use case also rejects an empty file,
requires the `%PDF-` signature, enforces the same size boundary before provider
work, and calculates the persisted content hash. Full document parsing and
structural interpretation remain separate future responsibilities.

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

## Upload use-case boundary

The authenticated endpoint is `POST /api/base-resumes`. It accepts one
`multipart/form-data` part named `file`; additional parts are rejected. The
transport reads at most 10 MiB plus a narrow multipart allowance, including when
the client does not send a trustworthy `Content-Length` header.

The dependency direction is:

```text
authenticated POST route
  -> base-resume upload service
  -> upload repository + Storage adapter
  -> Supabase Data API + private Storage
```

Each layer has one owner:

- the route owns trusted session resolution, bounded multipart parsing, HTTP
  status codes, and safe transport responses;
- the domain owns filename, exact content type, size, non-empty content, PDF
  signature, deterministic slot, object-key, and SHA-256 rules;
- the service owns the upload sequence, concurrent slot reconciliation, and
  compensating cleanup;
- the repository owns explicitly user-scoped `base_resumes` persistence;
- the Storage adapter owns immutable object operations in the `base-resumes`
  bucket.

The route creates one request-scoped authenticated Supabase client and passes
that same client through trusted identity resolution, persistence, and Storage.
It does not use a service-role key. The success response contains only the new
resume ID, normalized original filename, active slot, and creation timestamp.
Provider responses, hashes, object keys, and ownership identifiers remain on
the server.

Expected client-facing failures are stable application codes:

- `authentication-required` and `authentication-unavailable` for the trusted
  identity boundary;
- `invalid-upload`, `invalid-filename`, `unsupported-file-type`, `invalid-pdf`,
  and `file-too-large` for transport or deterministic validation;
- `active-resume-limit-reached` when all three active slots are occupied;
- `base-resume-upload-unavailable` for sanitized persistence, Storage, or
  consistency failures.

## Access and cleanup rules

The three repository-controlled policies on `storage.objects` allow an
authenticated user to:

- upload a new PDF only beneath their exact one-level namespace;
- read only an object they own in that namespace;
- delete only an object they own that has no matching `base_resumes` row.

The DELETE policy exists solely for compensating cleanup. The implemented write
sequence is:

1. Generate the base-resume ID and deterministic object key.
2. Validate and upload the new object without upsert.
3. Insert the matching `base_resumes` row.
4. If the insert fails, remove the still-untracked object.

Concurrent uploads may select the same available slot. The database uniqueness
constraint decides the winner. A losing request refreshes occupied slots and
either retries with the next deterministic slot or removes its untracked object
when the three-resume limit has been reached.

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

Run the catalog, authorization, real Storage API, and trusted upload-route
tests:

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
disposable Storage or upload tests against the hosted project. The upload suite
verifies exact row/object persistence, validation no-ops, object immutability,
deterministic slots, and cleanup under concurrent capacity pressure.

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

The hosted project is not used for disposable integration tests. OWL-27 may
consume the authenticated endpoint from the upload interface without bypassing
this server boundary or retaining test data in the hosted project.
