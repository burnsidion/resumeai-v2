# Tailoring and Working-Copy Review Design Specification

## Status and authority

This document defines the approved OWL-51 UX direction for explicit AI
tailoring and whole-copy review in the authenticated application workspace. It
is the behavioral and visual handoff for future implementation tickets.

When details conflict, use this order of authority:

1. The approved MVP workflow in
   [mvp-workflow.md](../product/mvp-workflow.md).
2. The truth, lifecycle, and provider boundaries in
   [tailoring-contracts.md](../architecture/tailoring-contracts.md).
3. This document.
4. The established applications workspace and graphite/cyan visual language in
   [applications.md](applications.md).

## Purpose

Tailoring lives inside the existing application workspace. It helps a user
move from a ready application to one complete, reviewable proposed resume
without implying that AI ran automatically or changed the original PDF.

The workspace must make four facts unmistakable:

- The user starts tailoring deliberately.
- The original uploaded PDF remains private and unchanged.
- The proposal is machine-generated and requires user review.
- Acceptance, revision, and discard apply to the complete proposal, not
  individual lines.

The experience should feel calm and bounded: one primary decision at a time,
plain-language explanations, and no invented certainty about AI output.

## Placement and information architecture

The tailoring area is a distinct panel in `/applications/:id`, following the
application's saved context and selected base resume. It is not a new route,
wizard, or modal. Application tracking state remains separate from tailoring
state throughout.

The panel has these stable regions:

1. **Tailoring status** — what state the application is in and the next honest
   action.
2. **Source context** — selected source filename and a secondary `View original
PDF` action that opens the existing private preview dialog.
3. **Review workspace** — only when a valid proposal is awaiting review;
   comparison content plus material-change explanations.
4. **Whole-copy decisions** — one clear primary action and restrained
   secondary/destructive actions appropriate to the state.

The original PDF preview is reference material. The review comparison uses
accessible, interpreted source text and structured proposal content; it must
not present a pixel-for-pixel PDF diff or imply that the uploaded layout is
being edited.

## States and behavior

### 1. Not ready

**Status:** `Not ready for tailoring`

Show the existing deterministic requirements: a saved job description and an
available selected base resume. Do not render a disabled `Start tailoring`
button as the main action. Instead, offer `Edit details` and explain what is
missing.

This is a valid saved-application state, not an error.

### 2. Ready

**Status:** `Ready for tailoring`

Show the selected source filename and a primary `Start tailoring` button.
Supporting copy:

> ResumAI will create a machine-generated working copy for you to review.
> Your original PDF will not be changed.

Selecting the action is the only event that starts AI. Before the request,
show a compact confirmation panel rather than a disruptive modal. It repeats
the selected source and says that the working copy will be reviewed before any
resume is finalized. The action label becomes `Create working copy`.

The secondary action is `Not now`, which closes the confirmation without
changing the application.

### 3. Processing

**Status:** `Preparing working copy`

Replace the ready action with one contained status card. It uses a subtle
in-house cyan activity indicator and three factual, non-percentage labels:

- Preparing the selected resume
- Comparing it with this role
- Creating a reviewable working copy

Only one label is visually active at a time, but no label claims exact
provider progress. The panel states that the user can keep this page open and
that the original PDF remains unchanged. It disables only tailoring actions;
the user can still navigate away and return later.

The page must not send a second request from a second click, refresh, or tab.
If another operation already exists, show the same processing treatment with
the message `Tailoring is already in progress for this application.`

### 4. Recoverable processing failure

**Status:** `Tailoring needs attention`

State that no new proposal was saved. If an earlier valid proposal exists, say
that it remains available for review; never imply that it was overwritten.

Use only sanitized, internally mapped explanations:

- Missing or unavailable source input: `Review application details`
- Session required: `Return to sign in`
- Temporary processing failure: `Try again`

The user can always return to the application without losing tracking details,
the original PDF, or a prior valid working copy.

### 5. Awaiting review

**Status:** `Working copy ready for review`

Place this introduction above the comparison:

> This is a machine-generated working copy based on your selected source
> resume and job description. Review it carefully before accepting it.

Show the exact source-resume filename and an `Original PDF` reference action.
Do not call the interpretation user-verified. Do not expose parser source-block
IDs, hashes, provider names, model names, or prompt versions.

The review workspace contains:

- **Source** — accessible interpreted source content in its original logical
  section order;
- **Working copy** — the complete proposed content in that same logical
  section order; and
- **Changes** — concise material-change explanations grouped by source section.

Change explanations use plain terms such as `Reworded`, `Reordered`, and
`Omitted`. They explain why an edit helps this role and identify the affected
section or item in human language; they do not claim that every unchanged line
was independently verified.

### 6. Request revision

**Status while submitting:** `Requesting a revision`

`Request revision` opens a compact inline form below the review actions. The
single optional field is labeled `What should the next working copy emphasize
or change?` Its helper text explains that the request applies to the complete
proposal and must remain truthful to the original resume.

Examples are guidance, not selectable prompt chips:

- Emphasize my accessibility work more clearly.
- Make the experience bullets more concise.
- Keep the technical detail, but use plainer language.

The submit action is `Request new working copy`; the secondary action is
`Cancel`. While submitted, return to the processing state. A successful
revision replaces the current unaccepted proposal; full content revision
history is not shown or retained for MVP. A failed revision leaves the prior
valid proposal available.

### 7. Accept

**Status:** `Working copy accepted`

`Accept working copy` opens a confirmation dialog. It says that accepting
confirms the complete working copy—not the original PDF—and that the next
separate step will produce an immutable finalized resume. The confirmation
action is `Accept working copy`; `Keep reviewing` closes the dialog.

After success, replace review actions with an accepted-state panel that makes
the next action clear: `Finalize resume` (future functionality). Until that
feature exists, show it as explanatory content, not a dead button.

### 8. Discard

**Status:** `Discard proposal?`

`Discard proposal` is a restrained destructive action. It opens a confirmation
dialog explaining that it removes only the current working copy. The
application, selected base resume, and original PDF remain unchanged.

Confirmation returns the tailoring panel to `Ready for tailoring`; cancellation
returns to review with no content changed. Discard never deletes the
application or source file.

## Comparison behavior

### Desktop (approximately 1024px and above)

Use a two-column comparison with equal visual weight:

```text
Source                             Working copy
selected resume · interpreted      machine-generated proposal
---------------------------------------------------------------
Experience                         Experience
...                                ...
Skills                             Skills
...                                ...
```

The change summary is a compact rail beneath the title or alongside the two
columns where width permits. It should not force the user to scan every line
for a hidden change indicator. Column headings remain visible during ordinary
scrolling when practical, without a complex synchronized-scroll requirement.

### Tablet and narrow desktop

When two columns would make resume text hard to read, stack the comparison and
place Changes directly after the proposal. Preserve a visible source/proposal
label at each section boundary.

### Mobile (below approximately 768px)

Use an accessible three-option segmented control: `Source`, `Working copy`,
and `Changes`. It changes the visible review region without changing or hiding
the underlying decision actions. The selected option uses text, contrast, and
`aria-selected`; it is not distinguished by cyan alone.

The original-PDF action remains available near the source label, but opening it
uses the existing full-screen-friendly preview dialog.

## Accessibility and motion

- Every state has a visible text label in addition to color or iconography.
- Processing uses one polite live announcement when entered and one when it
  completes or fails; it never announces each decorative motion step.
- The activity indicator pauses or becomes static under reduced-motion
  preferences.
- Source, proposal, and change-summary headings create a meaningful document
  outline for screen-reader navigation.
- Desktop columns retain a logical source-then-proposal reading order.
- Confirmation dialogs trap focus, return focus to their invoking action, and
  use explicit action labels rather than `Yes` or `No`.
- Failure recovery preserves the user's revision text until they cancel or a
  replacement succeeds.

## Responsibility boundaries

| Area                    | Owns                                                                        | Does not own                                             |
| ----------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| Application page        | Route composition, data loading, navigation, and transport recovery         | AI requests, evidence validation, or lifecycle decisions |
| Tailoring panel         | State-specific presentation and user intent                                 | Provider calls or persistence                            |
| Processing panel        | Calm status copy and reduced-motion behavior                                | Timing promises or provider progress measurement         |
| Comparison workspace    | Responsive source/proposal/change presentation                              | Truth validation or PDF layout comparison                |
| Whole-copy confirmation | Focused accept/discard confirmation behavior                                | The state transition itself                              |
| Server use cases        | Authorization, preparation, provider orchestration, validation, persistence | Browser presentation                                     |

## Implementation handoff

The current server orchestration creates or replaces a current valid working
copy and exposes a start endpoint. Future implementation must add a safe,
owned read model for the current working-copy content and material changes
before the review workspace can render production data.

The existing application detail route currently presents editing controls by
default, while the earlier applications specification describes a read-only
detail state. This design intentionally does not resolve that broader page
composition mismatch. The tailoring panel should be composable into the
application workspace without making editing or tracking behavior its concern.

## Deferred decisions

- The exact server transition that permits a new revision after a working copy
  has been accepted. Current persistence protects accepted copies from silent
  replacement; post-acceptance revision needs an explicit, separately reviewed
  lifecycle rule.
- Finalization UI, PDF rendering, download, and finalized-artifact history.
- Line-by-line approval, change scoring, prompt chips, and full revision
  history.
- Any dependency or component-library adoption for the processing indicator.
  The first implementation should use an owned, small component matching the
  established graphite/cyan system.
