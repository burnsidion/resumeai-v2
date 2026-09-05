# Applications workspace prototype

This standalone OWL-37 reference covers the approved visual states for:

- the authenticated application shell;
- a populated applications list;
- the zero-application state;
- responsive desktop, collapsed-navigation, and mobile presentations;
- the single-page application-creation experience;
- initial, validation, and submitting form states;
- optional source-resume selection and deterministic readiness guidance;
- ready and incomplete application-detail workspaces;
- application editing and tracking fields; and
- loading, recoverable-error, and missing-or-inaccessible states.

Open `index.html` directly in a modern browser. Use the prototype controls at
the top to switch between list, creation, detail, editing, and system states,
then resize the browser to inspect responsive behavior.

## Reference boundary

The durable behavioral source of truth is
[`docs/design/applications.md`](../../applications.md). The prototype is the
visual reference for its layout, hierarchy, responsive behavior, and state
treatment.

The controls, mock records, identity, counts, and dates are prototype-only.
They demonstrate layout and hierarchy and must not be copied into production
as product data.

This prototype has no package, network, server, or runtime dependency. It does
not import or execute Nuxt application code.
