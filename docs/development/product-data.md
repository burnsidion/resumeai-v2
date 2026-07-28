# Product Data Access

OWL-21 establishes the trusted, read-only product-data boundary above the MVP
schema and RLS policies. It makes the dashboard-required reads reusable without
connecting them to an API route, page, or component.

## Ownership and dependency direction

The product-data dependency direction is:

```text
future thin server route
  -> trusted authentication resolution
  -> request-scoped authenticated Supabase client
  -> dashboard product-data service
  -> focused domain repositories
  -> Supabase Data API protected by RLS
```

The current slice stops at the service. OWL-22 may add the thin route and
dashboard consumption without moving query syntax or product rules into the
delivery layer.

The layers own these responsibilities:

- `server/infrastructure/supabase/database.generated.ts` mirrors the local
  migration-controlled database schema for server-side type safety.
- `shared/product-data/dashboard.ts` owns the runtime-validated, provider-free
  contract that a future product endpoint may return.
- `server/repositories/` owns Supabase query syntax, explicit user filters,
  narrow projections, deterministic ordering, bounded limits, and safe
  repository failures.
- `server/services/dashboard-product-data.ts` coordinates the approved reads
  and validates their combined result. It does not resolve HTTP requests,
  sessions, or presentation state.

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

Fast unit tests cover contracts, repository query construction, projections,
zero states, deterministic limits, orchestration, and error sanitization.

The Playwright integration suite creates two disposable confirmed users against
the isolated local Supabase stack, inserts data through each authenticated
client, and invokes the server product-data service. It verifies that each
owner receives only their data and that deliberately requesting another user's
identifier still returns an empty result under RLS.

No service-role or secret key is used. The local project is disposable and must
be stopped without a backup after verification.
