# Upload UI Foundation

OWL-24 establishes the visual and interaction foundation for selecting a base
resume. It does not implement the product upload workflow.

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

OWL-27 will own:

- placement within the authenticated application;
- authoritative product instructions and file-size copy;
- client-side validation feedback;
- upload orchestration and truthful progress;
- idle, validating, uploading, success, and failure states;
- retry and duplicate-submission behavior;
- the three-active-resume experience;
- persisted resume cards, data refresh, and browser-level workflow tests.

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
