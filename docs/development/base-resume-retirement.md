# Base Resume Retirement

## Lifecycle contract

Retirement removes an active base resume from future selection without deleting
its source record or PDF. The only allowed lifecycle mutation clears
`active_slot` and sets `retired_at` on a currently active row owned by the
authenticated user.

Retirement preserves the resume ID, owner, filename, private Storage object key,
content type, size, SHA-256 hash, creation timestamp, and exact uploaded bytes.
The released slot becomes available to a later upload. A retired resume cannot
be reactivated or rewritten through the authenticated product role.

## Trusted mutation boundary

The authenticated endpoint is:

```text
POST /api/base-resumes/{id}/retire
```

It accepts no request body and returns only the retired resume ID and retirement
timestamp. The dependency direction is:

```text
authenticated POST route
  -> base-resume retirement service
  -> owner-scoped retirement repository
  -> Supabase Data API protected by one-way RLS
```

The route owns trusted session resolution, UUID validation, private response
headers, HTTP status codes, and safe transport errors. It creates one
request-scoped authenticated Supabase client and passes that same client into
the service context.

The service owns the retirement timestamp, retry reconciliation, and validation
of the repository result. The repository owns the narrowly projected,
explicitly owner-scoped update and lifecycle read. Neither the service nor the
repository owns HTTP state or Storage operations.

## Deterministic outcomes

The endpoint uses these stable client-facing outcomes:

- `200` with `{ baseResume: { id, retiredAt } }` after retirement;
- the same `200` representation when an owner safely retries an already-retired
  resume;
- `400` with `invalid-base-resume-id` for a malformed identifier;
- `401` with `authentication-required` when no trusted identity exists;
- `404` with `base-resume-unavailable` for both missing and cross-owner rows;
- `503` for temporary authentication or persistence unavailability; and
- a sanitized `500` when an inconsistent or unexpected result prevents a safe
  response.

If an update returns no row, the service reads the owner-visible lifecycle
state. A previously retired row returns its original retirement timestamp. A
missing or cross-owner row remains indistinguishable. If a provider failure may
have occurred after the update committed, the same read determines whether the
retirement succeeded before the service reports failure.

Provider errors, ownership identifiers, Storage keys, hashes, source metadata,
and raw database results never cross the endpoint boundary.

## Database and Storage protection

The repository-controlled `base_resumes_retire_own` policy allows an
authenticated owner to transition only from active to retired. Its `using`
condition requires the row to be active; its `with check` condition requires
the resulting row to be retired and retain the same owner. Column-level grants
continue preventing updates to source metadata.

Retirement performs no Storage request. The private source object remains
tracked by its `base_resumes` row, so the cleanup-only Storage DELETE policy
continues rejecting removal. Historical product relationships keep referencing
the same immutable source identity.

## Verification

Fast tests cover shared contracts, repository query construction, service
reconciliation, endpoint authentication handoff, UUID validation, response
validation, and sanitized failures. PostgreSQL authorization tests prove the
one-way owner-only update and reject cross-owner retirement, reactivation,
timestamp rewriting, and active-slot rearrangement.

The loopback-only Playwright integration test uses disposable confirmed users
and the real Nuxt, Auth, Data API, RLS, and Storage stack. It verifies that:

- unauthenticated and cross-owner requests cannot retire the source;
- an owner can retire and safely repeat the request;
- immutable row metadata and the exact PDF bytes remain unchanged;
- the retired source disappears from the active management read; and
- the released deterministic slot can be assigned to a later upload.

Run the local verification with:

```sh
pnpm test:database

NUXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_with_local_value \
pnpm test:integration
```

These tests must remain local and disposable. They require no service-role or
secret key and must never target the hosted project.
