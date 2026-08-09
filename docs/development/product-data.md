# Product Data Access

OWL-21 establishes the trusted, read-only product-data boundary above the MVP
schema and RLS policies. OWL-22 connects the dashboard to that boundary, while
OWL-30 adds a dedicated Base Resumes management read without widening the
dashboard preview contract.

## Ownership and dependency direction

The product-data dependency direction is:

```text
thin server route
  -> trusted authentication resolution
  -> request-scoped authenticated Supabase client
  -> focused product-data service
  -> focused domain repositories
  -> Supabase Data API protected by RLS
```

The dashboard and Base Resumes routes each follow this direction. Neither route
contains query syntax, and neither page or component receives a Supabase client.

The layers own these responsibilities:

- `server/infrastructure/supabase/database.generated.ts` mirrors the local
  migration-controlled database schema for server-side type safety.
- `shared/product-data/` owns runtime-validated, provider-free product contracts.
- `shared/dashboard/view-model.ts` and `shared/base-resumes/view-model.ts` own
  the validated client-facing response contracts.
- `server/repositories/` owns Supabase query syntax, explicit user filters,
  narrow projections, deterministic ordering, bounded limits, and safe
  repository failures.
- `server/services/` coordinates the approved reads and validates product data.
  Services do not resolve HTTP requests, sessions, or presentation state.
- `server/presentation/` maps validated product data to deterministic UI-facing
  values without accessing authentication, Supabase, or transport state.
- `server/api/` resolves trusted identity, invokes one service, maps one response,
  and exposes only stable sanitized errors.

Database-generated types do not cross the repository boundary. Pages and
components must not import repository modules or query product tables directly.

## Approved dashboard reads

The read layer currently provides:

- active application count for `draft`, `applied`, `interviewing`, and `offer`;
- interview count for exactly `interviewing`;
- the three most recently updated applications, ordered by `updated_at` and
  then `id`, both descending;
- up to three active base-resume previews;
- the newest working copy in `awaiting_review`, or `null`.

`rejected` and `withdrawn` applications are closed and therefore excluded from
the active count. No finalized-resume repository exists yet because the
approved dashboard read does not require one.

Every repository query includes the resolved user's identifier even though RLS
also restricts rows by `auth.uid()`. The explicit filter communicates intent
and bounds the query; RLS remains the database authorization boundary.

## Base Resumes management read

`GET /api/base-resumes` provides the dedicated management page with one private,
authenticated response. It does not reuse or expand the dashboard preview
response.

The management repository returns only active, non-retired rows and selects:

- resume ID;
- normalized original filename;
- creation timestamp;
- deterministic active slot; and
- file size in bytes.

Rows are ordered by `active_slot` and then `id`, both ascending. The product
contract also validates unique ascending slots, the three-resume limit, and the
relationship between the returned items and active count.

The presentation mapper derives remaining capacity, approved capacity copy,
UTC upload-date labels, slot labels, and IEC file-size labels. It does not add
Storage URLs, ownership identifiers, hashes, retirement history, or mutable
actions.

Zero, partial, and full-capacity collections are successful states. The endpoint
uses stable error codes for unauthenticated requests, temporary authentication
failure, and unavailable Base Resumes data. Provider messages remain server-side.

## Error boundary

Provider errors and unexpected database values are converted into sanitized
server errors. Shared product-data contracts never contain PostgREST error
objects, raw database rows, ownership fields, storage object keys, hashes, or
other infrastructure details.

## Generated database types

Rebuild the local database from migrations before regenerating the committed
types:

```sh
pnpm exec supabase db reset --local --no-seed
pnpm exec supabase gen types typescript --local --schema public \
  | pnpm exec prettier --parser typescript \
  > server/infrastructure/supabase/database.generated.ts
```

CI regenerates the types from the isolated local database and fails when the
committed file no longer matches the migration-controlled schema.

## Verification

Fast unit and Nuxt route tests cover contracts, repository query construction,
safe projections, zero and capacity states, deterministic ordering,
orchestration, trusted authentication handoff, response mapping, and error
sanitization.

The Playwright integration suite creates two disposable confirmed users against
the isolated local Supabase stack, inserts data through each authenticated
client, and invokes the server product-data services. It verifies that each
owner receives only their data, retired resumes stay outside the active
management collection, safe projections exclude persistence details, and
deliberately requesting another user's identifier still returns an empty result
under RLS.

No service-role or secret key is used. The local project is disposable and must
be stopped without a backup after verification.
