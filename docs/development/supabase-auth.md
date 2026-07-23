# Supabase Auth Setup

## Purpose and ownership

ResumAI V2 uses a fresh hosted Supabase project for authentication. Ian owns
creating and administering that project. Repository work must not create,
delete, or reconfigure the hosted project automatically.

This document records the project inputs required by the application. OWL-11
owns the browser and request-scoped server clients, SSR cookie refresh, trusted
server identity resolution, safe redirects, and provider-error translation.
Authentication pages, callback handling, and protected product routes remain
owned by later OWL-9 child issues.

## Hosted project configuration

Configure the hosted project in the Supabase Dashboard with these settings:

- Enable email and password authentication.
- Allow new users to sign up.
- Enable hosted email confirmation.
- Set the development Site URL to `http://localhost:3000`.
- Add `http://localhost:3000/auth/callback` as an exact allowed redirect URL.

The `/auth/callback` path is reserved for the later confirmation flow. OWL-11
does not implement that route.

Production and deployment-preview URLs remain deferred until a hosting platform
and deployment URL are approved. Add exact production redirect paths at that
time rather than enabling a broad wildcard now.

## Repository environment

From the Supabase project's **Connect** dialog, obtain:

- Project URL
- Publishable key beginning with `sb_publishable_`

Copy the repository example file and add those values locally:

```sh
cp .env.example .env
```

```dotenv
NUXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_with_project_value
```

Both values are intentionally public and are exposed through Nuxt public
runtime configuration. They do not grant privileged access.

Never add a Supabase secret key, legacy service-role key, database password, or
access token to browser configuration, committed files, tests, logs, or project
documentation. The local `.env` file is ignored by Git and must remain
uncommitted.

## Package boundary

The repository includes the official `@supabase/supabase-js` and
`@supabase/ssr` packages at exact versions. Browser code receives only the
Supabase Auth client through `useAuthenticationClient`; server code creates a
request-scoped client that reads and writes SSR cookies. Server authorization
must use `resolveAuthenticatedUser`, which validates signed claims and never
trusts browser session state or user-editable metadata.

Supabase CLI and local Supabase configuration are deliberately absent. They may
be reconsidered only if the authentication integration-test work in OWL-14
demonstrates a concrete need.
