# ResumAI V2

ResumAI V2 is a job-application workspace that helps job seekers tailor truthful
resumes, track applications, and preserve the exact resume submitted for each
role.

This repository is a fresh Nuxt application. The legacy `jobgoblin` and
`jobgoblin-backend` repositories are behavioral references only and are not
dependencies of V2.

## Prerequisites

- Node.js 24.18.0
- pnpm 10.9.0 through Corepack
- A Docker-compatible container runtime for authentication integration tests

With `nvm` installed:

```sh
nvm install 24.18.0
nvm use 24.18.0
corepack enable
corepack prepare pnpm@10.9.0 --activate
```

## Local setup

```sh
cp .env.example .env
```

Add the project URL and publishable key supplied by Ian to `.env`, then install
dependencies and start Nuxt:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The application is available at `http://localhost:3000`.

`NUXT_PUBLIC_APP_NAME` is optional and defaults to `ResumAI`. An explicitly empty
value is rejected with a clear configuration error.

`NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
required public configuration. See the [Supabase Auth setup](docs/development/supabase-auth.md)
for the hosted-project ownership boundary and local setup instructions.

## Commands

```sh
pnpm dev           # Start the development server
pnpm build         # Create a production build
pnpm preview       # Preview the production build
pnpm typecheck     # Run Nuxt and Vue TypeScript checks
pnpm lint          # Check code with ESLint
pnpm lint:fix      # Apply safe ESLint fixes
pnpm format        # Format supported files
pnpm format:check  # Check formatting without modifying files
pnpm test          # Run all tests once
pnpm test:integration # Run browser authentication tests against local Supabase
pnpm test:watch    # Run tests in watch mode
```

The integration command requires the isolated local Supabase environment and
its public test configuration. It never uses the hosted project. See
[Supabase Auth setup](docs/development/supabase-auth.md#isolated-authentication-integration-tests)
for the complete start, test, and cleanup sequence.

## Ownership

- `app/` owns browser-facing presentation and interaction.
- `config/` owns foundation-level configuration validation.
- `test/unit/` owns fast tests that do not require Nuxt runtime behavior.
- `test/nuxt/` owns tests requiring the Nuxt runtime.
- `test/integration/` owns browser journeys against isolated local services.
- `supabase/` owns the unlinked local service configuration used by those
  integration tests.
- `docs/product/` owns durable product behavior.
- `docs/architecture/` owns durable architecture decisions.
- `docs/development/` owns developer setup and external-service configuration
  guidance.

New directories should be introduced only when a real implementation slice
needs them. Product rules, persistence, providers, and server abstractions are
intentionally absent from this foundation.

## Documentation

- [MVP workflow](docs/product/mvp-workflow.md)
- [Architecture overview](docs/architecture/overview.md)
- [Supabase Auth setup](docs/development/supabase-auth.md)
