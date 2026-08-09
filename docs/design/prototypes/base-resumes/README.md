# Base Resumes page prototype

This standalone reference prototype explores the approved OWL-29 Base Resumes
management surface without importing or executing Nuxt application code.

Open `index.html` directly in a modern browser. The reference-state controls at
the top switch between:

- zero active resumes;
- one active resume;
- two active resumes;
- full three-resume capacity;
- loading;
- recoverable error; and
- retirement confirmation.

Resize the browser to review the expanded desktop sidebar, intermediate icon
rail, and mobile top bar and navigation panel.

## Design boundaries

- The prototype manages active source documents only.
- It deliberately excludes PDF preview, download, editing, AI state,
  application history, and retired-resume browsing.
- The upload entry points represent reuse of the existing trusted upload dialog;
  this prototype does not recreate that workflow.
- Retirement is a proposed future interaction. The prototype communicates that
  retirement frees an active slot while preserving the original PDF and
  historical references. It does not imply hard deletion.
- The state controls and mock identity are prototype-only and must not be copied
  into production UI.

The prototype uses the application's existing graphite/cyan tokens and system
font stack. It has no package, network, build, or runtime dependency.
