# Base Resume Upload UI

OWL-24 established the visual and interaction foundation for selecting a base
resume. OWL-27 connects that source-owned picker to the trusted OWL-26 upload
endpoint through the authenticated dashboard, and OWL-31 reuses the same
workflow on the Base Resumes management page.

## Decision

The base-resume picker recreates the restrained grid and raised-document visual
treatment explored through Inspira UI's File Upload pattern. No substantial
Inspira implementation code is copied, no component library is installed, and
the existing ResumAI Tailwind tokens remain authoritative.

`BaseResumeFilePicker.vue` is a source-owned, SSR-safe component. It renders a
native single-file input and a keyboard-operable browse button. Drag and drop is
an enhancement to that native path. The component owns only transient drag
state and emits the first selected `File`; it does not validate, upload, or
persist that file.

## Ownership boundary

The picker owns:

- accessible file-selection semantics;
- the PDF-oriented `accept` hint;
- browse, drag-enter, drag-leave, and drop interaction;
- disabled and drag-active presentation;
- ResumAI-owned visual treatment using existing design tokens.

The implemented OWL-27 workflow owns:

- placement within the authenticated application;
- authoritative product instructions and file-size copy;
- client-side validation feedback;
- upload orchestration and truthful progress;
- idle, validating, uploading, success, and failure states;
- retry and duplicate-submission behavior;
- the three-active-resume experience;
- persisted resume cards, data refresh, and browser-level workflow tests.

## Authenticated placement

The dashboard and `/base-resumes` management page are the approved upload
surfaces for the MVP. Each surface owns one instance of the same upload dialog
and refreshes its own trusted read after a confirmed upload.

The dashboard opens its dialog from three truthful entry points when capacity
remains:

- the zero-resume guidance card;
- the upload quick action;
- the available-slot row in the base-resume card.

The Base Resumes page opens its dialog from:

- the page-level upload action;
- the zero-resume guidance action; and
- the available-slot card.

At three active resumes, neither surface exposes an unnecessary upload entry
point. The dashboard quick action remains disabled with visible full-capacity
copy, while the management page shows its full-capacity state without an upload
action. The server remains authoritative if either read becomes stale between
rendering and submission.

## Runtime ownership

The browser dependency direction is:

```text
dashboard or Base Resumes page
  -> page presentation components
  -> upload dialog
  -> upload state composable
  -> authenticated Nuxt upload endpoint
```

Responsibilities remain separated:

- each page owns its dialog visibility and refreshes its existing authenticated
  read after confirmed success;
- dashboard cards own only their presentation and emit an upload intent;
- `BaseResumeUploadDialog.vue` owns modal focus, product instructions, capacity
  presentation, and state-specific controls;
- `BaseResumeFilePicker.vue` owns native browse and drag-and-drop interaction;
- `useBaseResumeUpload.ts` owns client upload state, one in-flight request, safe
  retry decisions, and sanitized error mapping;
- `validate-selection.ts` owns deterministic browser-side filename, MIME type,
  size, and PDF-signature checks;
- `POST /api/base-resumes` remains the trusted validation and persistence
  boundary.

No browser component accesses a Supabase client, Storage object, database row,
hash, or private object key directly.

## State and recovery behavior

The dialog presents idle, validating, ready, uploading, success, retryable
failure, reconciliation-required failure, expired-session recovery, and
full-capacity states. Progress is described as state rather than a fabricated
percentage because the current request mechanism does not expose trustworthy
byte progress.

Client validation prevents known-invalid selections from reaching the server,
but it is only an early usability boundary. The server repeats authoritative
validation. A confirmed retry-safe failure permits one explicit retry. An
ambiguous result requires reconciliation through the owning page's trusted read
before another upload so the client cannot blindly create duplicate rows or
objects.

After success, the owning page request is refreshed while the dialog continues
to show the confirmed result. The persisted resume card includes its normalized
filename, upload date, active state, and deterministic slot, and remains after a
page reload.

## Accessibility and motion

The workflow uses a labelled modal dialog, native file input, keyboard-operable
browse button, focus trapping and restoration, Escape dismissal outside the
uploading state, live status announcements, alert semantics, disabled states,
and globally defined focus-visible styling. The existing global reduced-motion
media query minimizes transitions and spinner animation without hiding product
state.

## Verification

Coverage is deliberately layered:

- unit tests verify deterministic selection validation and upload state/retry
  behavior;
- Nuxt component tests verify browse/drop interaction, dialog states,
  focus-management, dashboard entry points, refresh behavior, and full
  capacity;
- isolated Playwright tests verify the authenticated dashboard and Base Resumes
  journeys against local Supabase, including navigation, zero state, shared
  dialog reuse, invalid selection, persisted upload, immediate reconciliation,
  survival after reload, three-resume capacity, and mobile drawer behavior;
- database and integration tests continue to verify RLS, exact row/object
  persistence, immutability, deterministic slots, and compensating cleanup.

The input `accept` attribute is a browser hint, not a security boundary. OWL-25
adds private owner-scoped Storage plus bucket-level content-type and size
restrictions. The OWL-26 server workflow also inspects the PDF bytes, enforces
product limits, and coordinates object storage with persistence. See
[Base resume storage](base-resume-storage.md).

## Dependency decision

No new runtime or development dependency is required. A full Inspira setup
would introduce motion and utility dependencies plus global token conventions
that overlap with ResumAI's existing design system. VueUse's drop-zone utility
would reduce only a small amount of local event handling and is not justified
for this single primitive.
