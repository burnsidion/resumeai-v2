# ResumAI V2 Architecture

## 1. Architecture principles

ResumAI V2 is a single full-stack Nuxt application backed by a fresh Supabase
project.

The architecture follows these principles:

- Applications are the primary user-facing product object.
- Each responsibility has one clear owner.
- Route handlers translate HTTP; they do not contain business workflows.
- Business rules are independent of UI and provider-specific details.
- Supabase, AI, PDF parsing, and PDF rendering are replaceable infrastructure
  dependencies.
- Authentication establishes identity; authorization is enforced independently
  on every protected operation.
- Row Level Security provides defense in depth rather than replacing server
  authorization.
- Original uploaded resumes and finalized resume artifacts are immutable.
- Machine-generated interpretation is never represented as user-verified unless
  the user explicitly confirms it.
- AI proposes content; deterministic code controls permissions, state
  transitions, evidence validation, persistence, and document generation.
- Runtime schemas validate every untrusted boundary.
- MVP work stays synchronous unless real operational evidence justifies
  background processing.
- Abstraction is introduced where it establishes ownership or testability, not
  merely to create more layers.

## 2. High-level system shape

```text
┌─────────────────────── Browser ───────────────────────┐
│ Pages, layouts, components, composables               │
│ Supabase authentication session                       │
│ Calls ResumAI server API                              │
└──────────────────────────┬────────────────────────────┘
                           │ HTTPS
                           ▼
┌──────────────────── Nuxt server ──────────────────────┐
│ Thin API routes                                       │
│ Authentication and authorization                     │
│ Domain use cases and business rules                   │
│ Resume and application orchestration                  │
│ AI-tailoring orchestration                            │
│ Deterministic validation and PDF generation           │
│ Repository and provider adapters                      │
└───────────┬──────────────┬───────────────┬────────────┘
            │              │               │
            ▼              ▼               ▼
   ┌── Supabase ──┐  ┌─ AI provider ─┐  ┌─ PDF tools ─┐
   │ Auth          │  │ Analysis      │  │ Parsing     │
   │ PostgreSQL    │  │ Rewriting     │  │ Rendering   │
   │ Private files │  └───────────────┘  └─────────────┘
   └───────────────┘
```

The browser owns presentation and user interaction. It does not receive database
credentials with elevated access, AI credentials, or unrestricted storage
access.

The Nuxt server is the trusted application boundary. It authenticates the
request, authorizes access to the requested resource, validates input, invokes
the appropriate use case, and returns a safe response.

Supabase provides identity, relational persistence, and private object storage.
The AI provider analyzes and rewrites structured resume content but does not
decide authorization, persistence, or lifecycle state. PDF tools interpret
source documents and render finalized artifacts under server control.

Interpretation, tailoring, and PDF generation run inside normal server requests
for MVP. Background jobs are not introduced until runtime measurements
demonstrate a need.

## 3. Product domains and ownership

### Authentication and profile

Owns:

- Sign-up, sign-in, sign-out, and session restoration
- Resolving the authenticated user
- The application profile associated with a Supabase Auth identity
- Profile lifecycle rules

Does not own:

- Resume access rules
- Application ownership rules
- Tailoring state
- Storage paths
- AI-provider behavior

May depend on Supabase Auth and the profile repository. Other domains may depend
on its trusted user identity, but not on its UI or Supabase implementation.

### Base resumes

Owns:

- Uploading one to three active PDF base resumes
- File validation and immutable source-document metadata
- Active, replaced, or removed status
- Machine-generated interpretation associated with a specific source PDF
- Selecting whether an interpretation can be reused
- Access to the original private file

Does not own:

- Job-application details
- AI tailoring instructions
- Working copies
- Finalized tailored artifacts
- General-purpose storage behavior

It depends on authenticated identity, private storage, resume persistence, and
the PDF interpretation adapter.

Deleting or replacing an active resume must not destroy source material required
by historical applications.

### Applications

Owns:

- Company, role, job description, status, notes, and relevant dates
- The application's relationship to the selected base-resume version
- The user-facing application lifecycle
- Access to tailoring and finalized artifacts associated with the application

Does not own:

- Source resume uploads
- AI prompts or provider calls
- Working-copy contents
- PDF rendering

It depends on authenticated identity and may reference a base-resume version,
current working copy, and finalized artifacts. Those domains remain responsible
for their own records.

### Tailoring and working copies

Owns:

- Explicitly starting tailoring
- Preparing trusted inputs for analysis
- AI analysis and rewrite orchestration
- The current mutable working copy for an application
- Revision requests, replacement, acceptance, and discard transitions
- Validation that proposed content remains supported by source evidence

Does not own:

- The original uploaded PDF
- Application tracking fields
- Permanent finalized PDFs
- Authentication implementation
- Generic AI-client configuration

It depends on the application, selected resume version and interpretation, AI
adapters, and finalized-artifact domain.

### Finalized resume artifacts

Owns:

- Freezing an accepted working copy into an immutable structured snapshot
- Deterministic PDF rendering
- Private storage of finalized files
- Artifact integrity metadata
- Linking the exact finalized artifact to its application
- Authorized download access

Does not own:

- Working-copy editing
- AI analysis or rewriting
- Source-resume interpretation
- Application notes or statuses

It depends on an accepted working copy, the application, private storage, and
the PDF renderer.

## 4. Nuxt client and server boundaries

### Pages and layouts

Pages and layouts own routing, screen composition, page-level loading states,
and navigation structure. The dashboard is the authenticated home base, with
applications as its primary product focus.

They should not implement business rules, construct provider requests, query
product tables directly, or determine whether an operation is authorized.

### Components

Components present information, collect user input, emit user intent, and
provide accessible interaction states.

They may perform local display transformations but should not own persistence,
workflow transitions, AI orchestration, or domain validation.

### Composables

Composables coordinate reusable browser behavior such as session-aware API
calls, form state, application loading, and upload progress.

They are client-facing orchestration helpers—not an alternate domain layer.
Rules such as the three-resume limit, valid state transitions, or artifact
immutability must still be enforced on the server.

### Route middleware

Route middleware supports navigation and user experience, such as redirecting
an unauthenticated visitor away from the dashboard.

It is not an authorization boundary. Every protected server operation must
independently establish identity and resource access.

### Server API routes

API routes remain thin. A route should:

1. Resolve the authenticated user.
2. Parse and validate request data.
3. Invoke one use case.
4. Map its result or error to an HTTP response.

Routes should not contain SQL, prompt construction, storage-path rules,
document rendering, or multi-step business workflows.

### Server-side use cases

Use cases own application behavior:

- authorizing the requested operation;
- enforcing business rules and lifecycle transitions;
- coordinating repositories and adapters;
- maintaining idempotency where retries are possible;
- deciding what is committed when part of a workflow fails.

A use case may coordinate several domains, but the rules belonging to each
domain should remain with that domain.

### Repositories

Repositories own persistence operations expressed in product language. They
hide Supabase query details from use cases and provide clear ownership-scoped
operations.

Repositories should not decide HTTP responses, build prompts, render PDFs, or
silently bypass authorization. Their interfaces should make user ownership and
expected state explicit.

### External-provider adapters

Adapters isolate provider-specific behavior for:

- Supabase Auth, PostgreSQL, and Storage
- PDF interpretation
- AI analysis
- AI rewriting
- PDF rendering

Adapters translate between provider formats and validated application
contracts. Provider SDK response types should not spread throughout the
product.

### Shared schemas and types

Shared modules contain runtime schemas and safe types used by both client and
server, including request and response contracts, form inputs, product enums,
and structured working-copy formats.

Server-only persistence records, secrets, prompt inputs, and privileged provider
types remain server-side.

## 5. Supabase database, authentication, and storage boundaries

V2 will use a fresh Supabase project. Repository-controlled migrations become
the source of truth for its schema, indexes, constraints, functions, grants, and
policies. Production schema changes must not exist only as dashboard actions.

Supabase Auth owns credentials and session issuance. The Nuxt server must
resolve a trusted authenticated user for every protected operation. Public
profile information is stored separately and linked to the Auth identity by a
stable identifier.

Product data is accessed through Nuxt server use cases and repositories. Direct
browser access to product tables is not the default architecture.

Every exposed product table must have Row Level Security enabled with
ownership-based policies. RLS is defense in depth: server use cases must still
verify ownership and permitted state transitions.

The service-role credential, if needed at all, remains server-only and is
restricted to narrow operations that cannot safely use the authenticated user
context. It must never become the ordinary repository credential.

Database relationships should use stable identifiers, foreign keys, ownership
constraints, appropriate uniqueness constraints, and explicit lifecycle
states. File URLs must not be used as relational identifiers.

Resume documents are stored in private buckets. Database records hold stable
object keys and integrity metadata rather than permanent public URLs. Downloads
use short-lived authorized access. Storage paths should be opaque,
collision-resistant, and associated with the owning user and immutable document
identity.

## 6. Resume upload and interpretation lifecycle

The user uploads an existing PDF from the dashboard.

The server performs basic deterministic validation before accepting it:

- expected PDF file signature and supported content type;
- configured size limit;
- non-empty content;
- upload integrity;
- handling of unreadable, encrypted, or otherwise unsupported PDFs.

After validation succeeds, the original PDF is stored privately as an immutable
object and becomes available for application use. The user is not forced through
an extraction or verification wizard.

The recommended MVP interpretation strategy is hybrid:

1. Do not require interpretation during initial upload.
2. When tailoring is first requested, locate a reusable interpretation for that
   exact source document.
3. If none exists, parse the PDF once.
4. Validate and store a versioned machine-generated interpretation.
5. Reuse it while the source-document hash and interpretation version remain
   compatible.

This avoids repeatedly parsing the same PDF without making upload dependent on
extraction success. It also allows parser changes to invalidate or replace
derived interpretations without changing the original source file.

The uploaded PDF is the authoritative source artifact. The structured
interpretation is derived machine output. It may be usable, incomplete, or
invalid, but it must never be called user-verified unless the user explicitly
confirms it.

If interpretation fails, the base resume remains stored and available as a
source document, but tailoring cannot continue with it until the failure is
resolved. The user receives a recoverable explanation and may retry or select
another resume.

## 7. AI tailoring and trust boundaries

AI tailoring begins only after an explicit user request on an application with
an accessible base resume.

The workflow has two separate model stages:

1. Analysis compares the job description with the structured resume
   interpretation and identifies relevant, evidence-supported opportunities.
2. Rewriting produces a complete proposed working copy from the approved source
   material and analysis.

The stages may execute sequentially within one server request for MVP. They
remain separate logical interactions because they have different
responsibilities, inputs, validation rules, and test cases. This is preferable
to one large prompt that interprets the resume, analyzes the job, invents
strategy, rewrites content, formats output, and makes persistence decisions
simultaneously.

Model output must use a structured contract. Proposed changes should reference
source evidence where practical. The server rejects malformed output and any
deterministically detectable unsupported claim.

Deterministic protections must include:

- validating structured provider output;
- allowing only known resume sections and source references;
- preserving protected identity and employment facts;
- rejecting unsupported employers, roles, dates, education, certifications,
  skills, and numerical claims;
- enforcing ownership and allowed lifecycle transitions;
- preventing the model from choosing database identifiers, storage locations,
  or persistence state.

Semantic validation cannot guarantee that every AI sentence is truthful. The
architecture therefore uses layered protection: evidence-constrained inputs,
structured outputs, deterministic checks, explicit machine-generated labeling,
and mandatory user review before finalization.

AI does not generate the final PDF, authorize requests, mutate the original
resume, or decide that a working copy has been accepted.

## 8. Working-copy lifecycle

An application may exist without a working copy.

When tailoring is requested, the application progresses through a controlled
tailoring operation. The resulting proposal is stored as the application's
current mutable working copy.

For MVP, ResumAI preserves:

- the current working copy;
- limited operational metadata such as model/provider version, source hashes,
  timestamps, and revision number;
- the immutable finalized artifact.

It does not preserve the full content of every AI revision.

The user may:

- accept the complete working copy;
- request a revision, replacing the current proposal;
- discard it without deleting the application.

Line-by-line acceptance is outside MVP.

Acceptance is an explicit state transition and a prerequisite to finalization.
A revision request after acceptance returns the current working copy to an
editable review state. Previously finalized artifacts remain immutable and are
never rewritten.

Failures during interpretation or AI processing must not corrupt the prior
working copy. A retry either produces a valid replacement or leaves the last
valid state intact.

## 9. Finalization and deterministic PDF generation

Finalization begins only from an accepted, valid working copy.

The finalized-artifact use case:

1. Reauthorizes access to the application and working copy.
2. Validates that the working copy is accepted and still references the
   expected source.
3. Creates an immutable structured content snapshot.
4. Assigns integrity metadata or a content hash.
5. Passes that snapshot to the deterministic PDF renderer.
6. Validates the generated document.
7. Stores it in private storage.
8. Records the artifact and its application relationship.

The renderer controls layout, escaping, fonts, page behavior, and document
metadata. AI does not produce rendering instructions or raw PDF content.

Finalization must be idempotent enough that a timeout or retry does not silently
create conflicting artifacts. If database persistence or storage fails midway,
the use case must return a known failure and support safe retry or later
cleanup.

Historical application records retain their exact source-resume reference,
finalized structured snapshot, and finalized PDF even if the corresponding
active base resume is later replaced or removed.

## 10. Shared schemas, types, validation, and error handling

TypeScript types improve development safety but do not validate runtime data.
Runtime schemas are required at every untrusted boundary:

- browser requests;
- uploads and metadata;
- database records where assumptions matter;
- AI-provider responses;
- PDF interpretation output;
- environment configuration.

Schemas should define the validated contract. Types should be derived from
those schemas where possible to avoid parallel definitions drifting apart.

Business rules remain domain logic rather than being hidden inside transport
schemas. For example, a schema can confirm that a status value is syntactically
valid, while a domain rule decides whether the current user may perform that
transition.

Expected failures use a small stable error model, such as:

- unauthenticated;
- forbidden;
- invalid input;
- missing resource;
- state conflict;
- unsupported document;
- provider unavailable;
- internal failure.

API responses expose safe messages and stable error codes. Logs retain
diagnostic context and correlation identifiers without exposing resume
contents, job descriptions, credentials, signed URLs, or raw provider payloads
unnecessarily.

## 11. Testing strategy

Testing begins with the foundation rather than being added after feature
completion.

### Unit tests

Cover runtime schemas, domain rules, resume limits, lifecycle transitions,
protected-field comparison, evidence validation, and error mapping.

### Use-case tests

Exercise workflows with fake repositories and provider adapters. These tests
verify authorization, orchestration, failure recovery, idempotency, and state
changes without requiring live services.

### Route contract tests

Confirm authentication requirements, input validation, status codes, and
response shapes while ensuring routes remain thin.

### Supabase integration tests

Run repositories against an isolated test environment. Verify migrations,
relationships, constraints, indexes, transactional behavior, and storage
metadata.

### Authorization tests

Test RLS and private-storage access independently. Include attempts to read,
modify, finalize, or download another user's resources.

### Provider contract tests

Use fixed, privacy-safe fixtures for PDF interpretation and AI outputs. Test
malformed responses, unsupported claims, timeouts, and version changes without
making routine tests depend on live provider calls.

### PDF tests

Verify that deterministic structured input produces a readable PDF containing
the expected content. Add targeted rendered-page comparisons only where layout
regressions materially matter.

### End-to-end tests

Build the golden path incrementally: authenticate, upload a resume, create an
application, explicitly tailor, review, accept, finalize, download, and return
later to the same application history.

## 12. Legacy migration and preservation boundaries

### Verified legacy facts

The legacy system is split between a Vue/Vite frontend and Express backend. Its
tailoring workflow concentrates prompt construction, provider calls, parsing,
formatting, and other responsibilities in a large backend path. AI output is
parsed from free-form content without a sufficient evidence-validation
boundary.

The live legacy Supabase project contains valuable product data, but its public
product tables were found with Row Level Security disabled, and its storage and
relational conventions do not represent the V2 target architecture.

The legacy application is therefore a behavioral reference and migration
source—not code or architecture to port line for line.

### Preserve before eventual deletion

Before deleting the old Supabase project, the team should securely capture:

- database schema definitions, types, constraints, defaults, foreign keys,
  indexes, functions, triggers, grants, RLS state, and policies;
- relevant table exports with original stable identifiers and timestamps;
- Auth-user migration constraints and the relationship between Auth identities
  and public user records;
- storage bucket configuration and a metadata inventory of object keys, sizes,
  types, timestamps, and ownership;
- securely downloaded copies of referenced resume artifacts that are approved
  for migration;
- mappings between users, resumes, applications, tailored resumes, and storage
  objects;
- counts, checksums, and reconciliation results sufficient to verify an
  eventual migration;
- an inventory of duplicates, broken references, and possible orphaned objects
  without repairing them in place;
- external integration dependencies and configuration requirements without
  copying secrets into documentation;
- retention, backup, restoration-validation, and deletion approval records.

Sensitive exports must be encrypted, access-controlled, and retained only as
long as required.

### Do not carry into V2

V2 should not preserve:

- disabled RLS or overly broad grants;
- public resume-storage behavior;
- permanent document URLs used as relationships;
- implicit or unenforced ownership;
- service-role access as the default data path;
- free-form AI response parsing;
- the monolithic legacy tailoring endpoint;
- duplicated frontend and backend session logic;
- historical implementations solely for compatibility.

Migration should happen only after the fresh V2 schema, authorization policies,
and import validation are established and tested.

No legacy export, repair, migration, or deletion is performed as part of this
architecture.

## 13. Recommended high-level project-directory ownership

Folder structure should communicate ownership without creating a directory for
every small concept.

- `app/` owns browser-facing pages, layouts, components, composables, and route
  middleware.
- `server/api/` owns thin HTTP entry points.
- `server/domains/` owns product rules and server-side use cases grouped by the
  five approved domains.
- `server/repositories/` owns persistence contracts and implementations.
- `server/infrastructure/` owns Supabase, AI, PDF parsing, PDF rendering, and
  other provider adapters.
- `shared/` owns runtime schemas and safe contracts shared between browser and
  server.
- `supabase/` owns version-controlled migrations and database verification
  assets.
- `tests/` owns cross-boundary integration and end-to-end tests; focused unit
  tests may remain near their owners if the team prefers.
- `docs/product/` owns the approved product workflow.
- `docs/architecture/` owns durable architecture decisions.

The exact tree should emerge from real implementation slices. The important
rule is that ownership remains visible and dependencies point inward from
infrastructure and delivery mechanisms toward product behavior.

## 14. Approved architecture decisions

- ResumAI V2 is a fresh full-stack Nuxt application.
- V2 uses a fresh Supabase project.
- Supabase provides database, authentication, and private storage.
- Applications are the primary user-facing object.
- Product data operations pass through Nuxt server use cases and repositories.
- RLS is mandatory defense in depth.
- Original uploaded PDFs are immutable.
- Resume interpretation is machine-generated and never called user-verified
  without explicit user confirmation.
- Interpretation uses a hybrid parse-on-first-use and reuse strategy.
- Interpretation, AI tailoring, and PDF generation run within normal server
  requests for MVP.
- Analysis and rewriting are separate model stages.
- MVP retains only the current mutable working copy and immutable finalized
  artifacts.
- PDF generation is deterministic and separate from AI.
- The legacy implementation is a reference and migration source rather than
  target architecture.
- Each responsibility has one clear owner.

## 15. Remaining deployment-related decision

The deployment platform and runtime must be selected before implementing PDF
parsing and rendering.

The evaluation must confirm:

- supported Node runtime;
- compatibility with required parsing and rendering libraries;
- availability of required native binaries and fonts;
- memory and request-duration limits;
- request and response payload limits;
- temporary filesystem behavior;
- deployment-package size;
- concurrency and cost characteristics;
- operational logging and timeout behavior.

This decision does not block repository initialization, Nuxt configuration,
TypeScript, Tailwind, testing infrastructure, CI, documentation, or general
client/server ownership boundaries.

It does block committing to specific PDF parsing and rendering libraries or
designing workflows around unverified runtime limits.

## 16. Smallest safe first implementation slice

### Initialize ResumAI V2 Nuxt Foundation

The first slice should:

- initialize the Nuxt application with TypeScript and Tailwind;
- establish strict type checking, formatting, linting, and test commands;
- add a minimal application shell and smoke test;
- add CI checks for installation, formatting, type checking, linting, tests, and
  production build;
- establish validated non-secret environment configuration;
- create the approved documentation locations;
- record the high-level directory ownership rules from this architecture;
- document local setup and contribution expectations.

It should not yet:

- implement authentication;
- connect a production Supabase project;
- create product tables or migrations;
- implement resume upload;
- select PDF libraries;
- call an AI provider;
- build tailoring behavior;
- introduce background jobs;
- create speculative repositories or domain abstractions without a real use
  case.

The slice succeeds when the team has a clean, reproducible, tested Nuxt
foundation that can support the next bounded feature without prematurely
locking in infrastructure decisions.
