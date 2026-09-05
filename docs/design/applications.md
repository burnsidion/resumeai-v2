# Applications Workspace Design Specification

## Status and authority

This document and the committed
[applications workspace prototype](./prototypes/applications/index.html) define
the approved OWL-37 direction for ResumAI V2.

The prototype is the visual authority for layout, hierarchy, spacing, states,
and responsive behavior. This document is the behavioral authority when a
static prototype cannot demonstrate navigation, validation, loading, or
recovery.

When implementation details appear to conflict, use this order of authority:

1. The approved product workflow in `docs/product/mvp-workflow.md`.
2. The behavior and boundaries in this document.
3. The committed applications prototype.
4. The established authenticated-shell and graphite-and-cyan visual language.

Companies, roles, dates, filenames, counts, and identity details in the
prototype are realistic mock data. They communicate hierarchy and density and
must not become production fixtures.

## Purpose

Applications are the primary user-facing product object. The workspace gives a
job seeker one calm place to:

- see saved opportunities;
- create an application with only the information currently available;
- review and update tracking details;
- associate an active base resume when useful; and
- understand whether the application has the inputs required for future
  tailoring.

The experience should answer:

- What opportunity am I working with?
- What have I already saved?
- What is missing before tailoring can begin?
- What is the next honest action available now?

## Non-responsibilities

OWL-37 does not define or approve:

- AI analysis, working-copy review, revisions, or finalization;
- PDF interpretation, generation, preview, or download;
- application deletion;
- search, filtering, analytics, reminders, or notifications;
- background jobs or automatic tailoring;
- a new application shell or global design system; or
- server endpoints, repositories, persistence behavior, or database changes.

The interface may describe preparation for future tailoring, but it must not
render a tailoring action until that workflow exists.

## Routes and navigation

The approved routes are:

| Route               | Responsibility                                     |
| ------------------- | -------------------------------------------------- |
| `/applications`     | Owned application list and its page-level states   |
| `/applications/new` | Explicit creation of one draft application         |
| `/applications/:id` | One owned application, including its editing state |

Editing remains within `/applications/:id`; OWL-37 does not introduce a
separate edit route.

Applications is selected in the existing authenticated navigation. The page
must consume the same shell and identity state as Dashboard and Base Resumes,
not create another navigation or session model.

Successful creation navigates to the newly created application. Back and
Cancel from creation return to `/applications` without creating a record.
Cancel from editing discards unsubmitted changes and returns to the read-only
detail view. Saving edits returns to the updated detail view.

## Application concepts

### Tracking status

Tracking status describes the job-search lifecycle only:

- `Draft`
- `Applied`
- `Interviewing`
- `Offer`
- `Rejected`
- `Withdrawn`

New applications always begin as `Draft`. Status is shown as text as well as
color. Status never implies that tailoring has started or completed.

### Tailoring readiness

Tailoring readiness is derived, not stored or manually selected. An application
is ready only when both conditions are true:

1. A non-empty job description is saved.
2. An available active base resume is selected.

Company, role, status, applied date, posting URL, and notes do not affect this
calculation. Tracking status and tailoring readiness must remain visually and
semantically distinct.

If one or both inputs are missing, show the specific requirements. A saved
application that is not ready is a valid product state, not an error.

### Selected source resume

Base-resume selection is optional during creation and editing. The selector
shows only active, available source resumes and includes an explicit “No base
resume” option.

Selecting a resume does not modify the uploaded PDF and does not start AI. The
detail view identifies the exact selected source by filename. Behavior for
changing a source after a working copy exists belongs to the later tailoring
workflow and is not defined here.

### Posting URL

The posting URL is optional reference information. ResumAI does not scrape,
import, or infer job content from the link in this experience. A saved URL is
shown as an external reference and should use safe new-tab behavior when opened.

## Application list

### Populated state

`/applications` presents a focused management list ordered by most recently
updated, with deterministic record ID ordering as the tie-breaker.

Each row prioritizes:

1. Role and company identity.
2. Tracking status.
3. Tailoring readiness or the most relevant missing requirement.
4. Updated date when space permits.
5. A clear navigation affordance.

The complete row opens the application detail route. It should be implemented
as one accessible navigation target rather than a clickable container with
nested controls.

The page header contains one primary `Create application` action. The list is
not a spreadsheet, and OWL-37 does not introduce sorting controls, bulk actions,
filters, or pagination.

### Empty state

An authenticated user with no applications sees:

- a clear `Create your first application` heading;
- copy explaining that company and role are enough to begin;
- one `Create application` action; and
- reassurance that a resume and tailoring can be added later.

Zero applications is a successful response, not a loading or error state.

## Application creation

`/applications/new` is one calm page rather than a wizard or modal. The page
uses three content groups and a contextual preparation rail.

### Field hierarchy

| Group       | Field           | Requirement | Behavior                               |
| ----------- | --------------- | ----------- | -------------------------------------- |
| Essentials  | Company         | Required    | Trimmed, non-empty value               |
| Essentials  | Role            | Required    | Trimmed, non-empty value               |
| Job context | Job description | Optional    | Required later for tailoring readiness |
| Job context | Posting URL     | Optional    | Reference only                         |
| Notes       | Private notes   | Optional    | Visible only to the owning user        |
| Source      | Base resume     | Optional    | Active resume or explicit none         |

Status and applied date do not appear during creation. The system creates a
`Draft`; tracking changes happen from the detail workspace.

### Save behavior

- Creation is explicit. There is no autosave.
- Saving never starts AI, even when the application is ready for tailoring.
- While submitting, form controls and navigation actions are disabled to
  prevent duplicate requests.
- The loading control retains a visible label such as
  `Creating application…` and exposes a polite status announcement.
- A successful save navigates to `/applications/:id`.
- A recoverable save failure preserves all entered values and presents a safe
  retry path.

### Validation behavior

Validation occurs when the user attempts to save and does not erase entered
values.

- Put errors directly beneath the related field.
- Mark invalid controls programmatically and connect each message with
  `aria-describedby`.
- Show a concise summary above the form when multiple fields fail.
- Move focus to the summary after a failed submission.
- Use internally mapped messages; never expose provider or database errors.
- Do not mark optional readiness inputs as creation errors.

The preparation rail updates the user's understanding of what remains before
tailoring. It does not prevent saving a valid draft.

## Application detail

`/applications/:id` restores the latest valid application state without
triggering AI.

The read-only detail hierarchy is:

1. Back navigation.
2. Company, role, status, and last-updated context.
3. Application details and an `Edit details` action.
4. Job description and private notes.
5. Tracking summary.
6. Selected base resume.
7. Tailoring-readiness explanation.

The detail workspace uses one dominant information panel and a narrower
contextual rail. Status and dates belong to tracking. Source selection and
readiness are separate cards so neither is confused with application status.

### Ready state

When a saved job description and available selected resume exist:

- label the application `Ready for tailoring`;
- show both satisfied requirements;
- identify the selected source resume; and
- show no active tailoring control until that capability is implemented.

Readiness is informational. It does not mean the resume was interpreted, AI was
run, a working copy exists, or the user accepted anything.

### Incomplete state

When requirements are missing:

- keep the saved application fully accessible;
- show neutral `Not added` treatment where optional content is absent;
- list each missing tailoring input;
- offer the existing edit action; and
- avoid presenting the state as a failure.

The strongest action may become `Add missing details`, which opens the same
editing state rather than a separate workflow.

## Editing

Editing replaces the read-only detail content while keeping the user on
`/applications/:id`.

The form exposes:

- company;
- role;
- tracking status;
- optional applied date;
- optional job description;
- optional posting URL;
- optional notes; and
- optional active base-resume selection.

Applied date remains optional and does not automatically infer or change
tracking status. Posting-link edits do not import job content. Source-resume
changes do not start tailoring.

The same required-field, validation, error-preservation, and duplicate-submit
rules used by creation apply to editing. Save changes affect this application
only. Application deletion is unavailable.

## Loading, failure, and access states

### Loading

Preserve the expected page shape with restrained skeletons rather than a blank
canvas or blocking full-screen spinner.

- Set the owning region to `aria-busy="true"`.
- Include one concise screen-reader loading message.
- Do not announce every skeleton element.
- Prevent layout shifts where practical.
- Respect reduced-motion preferences.

### Recoverable failure

For a temporary request or network failure:

- state that application information was not changed;
- provide one primary `Try again` action;
- provide `Back to applications` as the secondary escape; and
- use a sanitized, internally mapped message.

A retry reissues the same read operation. It must not mutate the application.

### Missing or inaccessible application

Use one neutral not-found presentation for both an unknown record and a record
the current user does not own. Do not reveal whether another user's application
exists.

The state contains no company, role, resume, or other private detail and offers
only `Back to applications`.

## Responsive behavior

### Desktop

At approximately 1280px and above:

- Use the existing expanded 216px authenticated sidebar.
- Use approximately 48px page padding and 20–24px content gaps.
- Keep creation and detail content in a wide main column with a roughly 280–350px
  contextual rail.
- Keep contextual preparation visible with restrained sticky positioning when
  the page is long.
- Allow list rows to use column alignment without becoming a data table.

### Collapsed navigation and tablet

From approximately 768px through 1279px:

- Use the existing 72px navigation rail.
- Preserve two columns while both remain readable.
- Stack the contextual rail beneath the main content near 1024px.
- Keep tracking and source cards beside one another when space permits, with
  readiness spanning the available width beneath them.
- Remove lower-priority list metadata before truncating role or company.

### Mobile

Below approximately 768px:

- Use the existing authenticated mobile top bar and navigation drawer behavior.
- Present content in one column with approximately 16–20px outer padding.
- Stack company and role fields.
- Keep source-resume options full width.
- Stack detail tracking, source, and readiness after the main information.
- Make primary and secondary form actions comfortably tappable and visible at
  the end of the form.
- Wrap role names and preserve company identity rather than forcing horizontal
  scrolling.
- Let the development-only prototype-state control scroll horizontally; this
  control does not belong in production.

## Accessibility and interaction

- Every field has a persistent visible label.
- Required and optional status is communicated with text, not color alone.
- Every status and readiness state has meaningful text.
- Focus uses the existing high-contrast cyan treatment.
- Interactive targets should be at least 44px high where practical.
- Icon-only controls require accessible names.
- External references identify their behavior accessibly.
- Error summaries receive focus after submission and link or correspond to the
  invalid fields.
- Disabled and submitting states remain legible and expose status in text.
- Essential information never depends on hover.
- Reduced-motion preferences suppress shimmer and non-essential transitions.

## Presentation ownership

The following are useful application-specific responsibilities, not mandatory
component names:

- **Application list** owns list composition, row ordering, and zero state.
- **Application row** owns one accessible route target and its compact status.
- **Application form** owns shared creation/editing field presentation and
  field-level validation rendering.
- **Source-resume selector** owns active resume options and explicit no-selection.
- **Tracking summary** owns status, applied date, and created/updated context.
- **Readiness summary** owns the pure presentation of satisfied and missing
  deterministic requirements.
- **Application async state** owns loading, retry, and inaccessible page
  presentations.

Pages remain responsible for route composition, loading, transport errors, and
navigation. These boundaries do not authorize speculative global primitives or
business logic inside presentation components.

## Production handoff

Production implementation should preserve these boundaries:

- The browser renders trusted view models; it does not decide ownership.
- Server authorization scopes every application read and write to the
  authenticated user.
- Validation uses shared schemas at the transport boundary and authoritative
  business rules on the server.
- Readiness is derived consistently from saved application and active-resume
  data.
- Provider failures are sanitized before reaching the page.
- Loading, error, and empty states remain page concerns rather than fabricated
  product records.

OWL-37 approves experience and behavior only. Endpoint design, repository
contracts, persistence, and production Vue components belong to later bounded
implementation tickets.
