# Deployment Runtime

## Decision

ResumAI V2's intended MVP runtime is a Railway persistent service built from a
repository-controlled Dockerfile.

Railway is the hosting provider; the Dockerfile is the reproducible recipe for
the environment Railway runs. This decision does not create a Railway project,
deploy the application, configure a domain, or introduce production secrets.

## Why a container runtime

Nuxt can run as a normal Node server. A container keeps the production Node
version, operating system, and future PDF dependencies explicit and
reproducible instead of relying on a provider's implicit serverless runtime.

That matters because later PDF interpretation or deterministic rendering may
need operating-system packages, fonts, or native binaries in addition to
JavaScript dependencies. Those choices remain deferred to their own feature
work; this document does not select a parser or renderer.

## Runtime contract

The future production image must:

- use Node 24, matching the repository's supported runtime;
- use a Debian-based slim image so future system PDF dependencies can be
  explicitly installed and reproduced;
- build the Nuxt application and run the Node server output;
- set `NODE_ENV=production`;
- bind to `0.0.0.0` and respect the host-provided `PORT`; and
- run as a single long-lived HTTP service, not as a static site, edge function,
  or background worker.

The Nuxt build requires the existing public Supabase URL and publishable key.
They must be supplied as build arguments during image creation and as runtime
environment variables when the service starts. They are public configuration,
not server secrets, but the Dockerfile intentionally contains no project
values. Future server-only credentials must be supplied only at runtime and
must never be Docker build arguments.

The application must treat its local filesystem as ephemeral. It may use a
request-scoped temporary directory for PDF work, then clean it up. Original
base-resume PDFs and future finalized artifacts remain in private Supabase
Storage; no document, session, or product state may depend on a local volume.

## PDF capability boundary

The runtime must support later installation of the OS packages, fonts, and
native binaries selected by the PDF interpretation and rendering tickets. The
container baseline is intentionally compatible with that work, but it does not
make a parser or renderer choice now.

The later deterministic renderer will produce a ResumAI-owned, conservative
template with selectable text, a simple one-column structure, and stable
typography and spacing. It will not attempt to edit the uploaded PDF's original
visual layout in place.

For MVP, interpretation, tailoring, and final rendering remain normal server
requests. The hosting plan selected before public launch must provide enough
CPU, memory, request duration, request/response size, and logging visibility
for the measured workloads. Until those workloads exist, the team should not
pretend that an exact production size or timeout has been proven.

## Local and CI parity

Docker currently supports the isolated local Supabase stack used by database
and browser-integration tests. It does not currently run the Nuxt development
server.

The forthcoming application Dockerfile will make the production build and
startup command testable locally and in CI. That container check will validate
the repository-controlled runtime contract; it will not deploy to Railway or
use production documents, credentials, or Supabase data.

## Deferred work

- Creating a Railway account, service, domain, health check, or environment
  variables.
- Selecting or installing PDF parsing, PDF rendering, font, or native-binary
  tooling.
- Adding OpenAI configuration or application-tailoring behavior.
- Establishing measured resource limits from representative PDF workloads.

Those decisions belong to the relevant implementation tickets after this
runtime baseline is in place.
