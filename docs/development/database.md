# Database Development

## Canonical schema

Supabase migrations in `supabase/migrations/` are the source of truth for the
ResumAI V2 database. Product schema changes must be introduced through ordered,
reviewable migrations rather than through hosted Dashboard changes.

OWL-19 establishes only the first relational product structures. Row Level
Security, grants, storage buckets, repositories, APIs, generated application
types, and hosted deployment remain separate implementation boundaries.

## Local workflow

The database workflow uses the same unlinked, isolated Supabase environment as
the authentication integration tests. It does not read or modify the hosted
project.

Start the local services:

```sh
pnpm exec supabase start
```

Rebuild the database from the committed migrations without seed data:

```sh
pnpm exec supabase db reset --local --no-seed
```

Run the pgTAP schema and invariant tests:

```sh
pnpm test:database
```

Destroy the isolated environment afterward:

```sh
pnpm exec supabase stop --no-backup
```

The database tests create disposable Auth and product rows inside transactions
that are rolled back. No seed fixture or persistent test user is required.

## Schema synchronization

No generated TypeScript database types are committed by OWL-19 because no
application code consumes the product schema yet. The future repository and API
slice should define the type-generation command and generate types from a clean
local database built from these migrations.

RLS is deliberately absent from the OWL-19 migrations. It must be implemented
and verified before browser-accessible product data is exposed.
