# Database Development

## Canonical schema

Supabase migrations in `supabase/migrations/` are the source of truth for the
ResumAI V2 database. Product schema changes must be introduced through ordered,
reviewable migrations rather than through hosted Dashboard changes.

OWL-19 establishes the first relational product structures. OWL-20 adds the
repository-controlled authorization boundary for those tables. OWL-21 adds
generated database types and the first read-only product-data repositories and
service. Storage buckets, write use cases, APIs, and product feature integration
remain separate implementation boundaries.

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
that are rolled back. Authorization tests switch between two authenticated JWT
subjects and the anonymous role to exercise real PostgreSQL grants and RLS
behavior. No seed fixture or persistent test user is required.

## Product authorization model

All five MVP product tables have RLS enabled explicitly by migration. Every
policy targets `authenticated` and compares `auth.uid()` with the row's
`user_id`. Composite ownership foreign keys prevent a row owned by one user
from referencing another user's parent record.

The application uses these minimum grants:

- `base_resumes`: select, insert, and updates limited to retirement fields;
- `resume_interpretations`: select and insert only;
- `applications`: select, insert, and updates limited to mutable application
  fields;
- `working_copies`: select, insert, mutable-field updates, and delete so the
  current proposal can be discarded;
- `finalized_resumes`: select and insert only.

Anonymous and service-role DML grants are revoked from the product tables. The
application does not use a service-role key. Base-resume source fields,
interpretations, and finalized resumes remain immutable through column-level
grants. Application deletion remains unsupported. A working copy may be
deleted only by its owner, and existing foreign keys prevent deletion once a
finalized resume references it.

Interpretation and finalization inserts remain server-owned use cases even
though they execute with the authenticated user's database role. RLS enforces
ownership isolation; it does not replace server validation of lifecycle
transitions, source evidence, hashes, or generated artifacts. Browser code must
not treat these table grants as permission to bypass the Nuxt server boundary.

The ownership-leading and deterministic-ordering indexes introduced with the
OWL-19 schema also support these policies; OWL-20 does not add redundant
indexes. The local performance advisor may describe the composite ownership
foreign keys on interpretations, working copies, and finalized resumes as
unindexed. Each child lookup is already covered by an index beginning with its
globally unique parent identifier, so duplicating those indexes solely to match
the full composite key would add write overhead without improving the bounded
lookup.

The hosted project currently has a platform event trigger that automatically
enables RLS when a public table is created. That trigger is a hosted safety net,
not the source of truth: it creates no ownership policies or application
grants, and it is intentionally not reproduced in the local project. Each
repository migration must continue enabling RLS explicitly so clean local and
hosted databases receive the same product-table security. A conditional
repository migration revokes direct function execution from `anon`,
`authenticated`, and `service_role` when that hosted-only trigger function is
present. The event trigger continues to operate without exposing its
`SECURITY DEFINER` function as an RPC.

## Schema synchronization

The committed server-only database types are generated from a clean local
database built from the repository migrations:

```sh
pnpm exec supabase db reset --local --no-seed
pnpm exec supabase gen types typescript --local --schema public \
  | pnpm exec prettier --parser typescript \
  > server/infrastructure/supabase/database.generated.ts
```

Do not hand-edit the generated file. CI regenerates it from the isolated local
schema and compares it with the committed version.

RLS policies and grants must be changed through repository migrations and
verified by `pnpm test:database` before product data is consumed by the
application. See [Product data access](product-data.md) for the server-side
repository and service boundaries.
