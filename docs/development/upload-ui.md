# Base Resume Upload UI

OWL-24 established the visual and interaction foundation for selecting a base
resume. OWL-27 connects that source-owned picker to the trusted OWL-26 upload
endpoint through the authenticated dashboard.

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

The dashboard remains the only base-resume upload surface for the MVP. It owns
one upload dialog and opens that dialog from three truthful entry points when
capacity remains:

- the zero-resume guidance card;
- the upload quick action;
- the available-slot row in the base-resume card.

No dedicated base-resume route or sidebar destination is introduced. At three
active resumes, the available-slot row is absent and the quick action is
disabled with visible full-capacity copy. The server remains authoritative if
dashboard data becomes stale between rendering and submission.

## Runtime ownership

The browser dependency direction is:

```text
dashboard page
  -> dashboard presentation components
  -> upload dialog
  -> upload state composable
  -> authenticated Nuxt upload endpoint
```

Responsibilities remain separated:

- the dashboard page owns dialog visibility and refreshes the existing
  authenticated dashboard request after confirmed success;
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
ambiguous result requires dashboard reconciliation before another upload so the
client cannot blindly create duplicate rows or objects.

After success, the dashboard request is refreshed while the dialog continues to
show the confirmed result. The persisted resume card includes its normalized
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
- isolated Playwright tests verify the authenticated dashboard journey against
  local Supabase, including invalid selection, persisted upload, immediate
  reconciliation, three-resume capacity, and survival after reload;
- database and integration tests continue to verify RLS, exact row/object
  persistence, immutability, deterministic slots, and compensating cleanup.

The input `accept` attribute is a browser hint, not a security boundary. OWL-25
adds private owner-scoped Storage plus bucket-level content-type and size
restrictions. The later server workflow must still inspect the PDF bytes,
enforce product limits, and coordinate object storage with persistence. See
[Base resume storage](base-resume-storage.md).

## Dependency decision

No new runtime or development dependency is required. A full Inspira setup
would introduce motion and utility dependencies plus global token conventions
that overlap with ResumAI's existing design system. VueUse's drop-zone utility
would reduce only a small amount of local event handling and is not justified
for this single primitive.
