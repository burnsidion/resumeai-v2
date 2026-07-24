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

## OWL-12 implementation notes

The approved authentication exploration remains the visual source of truth:

- [ResumAI V2 — OWL-12 Authentication Exploration](https://www.figma.com/design/nTdovxL6aEm5xYseRelD3X/ResumAI-V2-%E2%80%94-OWL-12-Authentication-Exploration?node-id=9-531)

The Figma MCP Starter-plan limit prevented node-level design-context extraction
during implementation. The implementation therefore uses the approved frames
and the recorded dark color, typography, spacing, radius, elevation, and state
decisions that the team had already reviewed. These deliberate deviations keep
the behavior honest and within OWL-12:

- Password visibility uses accessible **Show** and **Hide** text instead of
  introducing an unverified icon asset.
- The verification-pending screen displays the submitted email only during the
  current browser visit. A refresh falls back to generic copy rather than
  placing an email address in the URL.
- Resending confirmation email is not exposed because OWL-12 does not define
  resend behavior or rate-limit handling.
- The approved Forgot Password design is preserved in Figma but is not linked
  or implemented. Password recovery is deferred to a dedicated issue.
- Signout and the authenticated dashboard presentation remain owned by OWL-13.
  OWL-12 includes only the smallest protected `/dashboard` placeholder needed
  to verify route behavior.

The hosted default email provider is suitable only for limited development
testing: it sends to authorized project-team addresses and is subject to a
low provider rate limit. Production email delivery configuration remains
outside OWL-12.
