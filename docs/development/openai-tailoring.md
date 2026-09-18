# OpenAI tailoring provider

This document describes the server-only OpenAI provider foundation for resume
tailoring analysis. It is not a browser integration guide and does not expose a
credential, model default, or user-facing tailoring control.

## Configuration

Add these values to the uncommitted local `.env` file only when a server request
will run AI tailoring:

```dotenv
OPENAI_API_KEY=
OPENAI_TAILORING_MODEL=
```

Both values are required together. The repository deliberately has no model
default: selecting an approved model is an explicit deployment and product
decision.

`OPENAI_API_KEY` must never use the `NUXT_PUBLIC_` prefix, appear in client
code, be committed, be supplied as a Docker build argument, or be placed in a
test fixture. The current Nuxt public-environment validation intentionally does
not read either value, so builds and non-tailoring tests do not require an AI
credential.

## Current boundary

The analysis path is server-only:

```text
owned application
  -> deterministic readiness check
  -> exact resume interpretation
  -> OpenAI provider adapter
  -> deterministic evidence validation
```

The provider receives a job description plus the minimum structured resume
content needed for analysis. It does not receive raw PDFs, contact blocks,
Supabase credentials, database IDs, storage keys, ownership identifiers, or
product lifecycle state.

The adapter uses OpenAI Structured Outputs with the repository-owned analysis
schema. Responses are requested with provider storage disabled, no automatic
retries, and a 30-second timeout. Provider-specific response types and raw
errors remain in the infrastructure adapter. The service returns only validated
domain analysis or a stable, sanitized failure.

Structured output is a shape guarantee, not a truth guarantee. Before analysis
can be returned, ResumAI verifies that every finding targets an existing logical
section or item and cites evidence belonging to that exact target. This is the
deterministic guardrail; mandatory user review remains the product safeguard for
semantic judgment.

## Current scope

This foundation does not yet expose an HTTP endpoint, browser control, working
copy, persistence write, revision flow, or live-provider integration test.
Tests use synthetic fixtures and an injected in-memory transport. Routine CI
must not call OpenAI.

The next tailoring slice may expose the use case through an explicitly
authenticated server endpoint, but it must retain the same ownership,
validation, and provider boundaries documented in
[Tailoring contracts](../architecture/tailoring-contracts.md).
