# Course Draft Workspace — V1 Specification

## Goal

Reduce the repeated setup work required to create an editable Kyron asset while
keeping a human responsible for reviewing and submitting the course setup.

## Workflow

1. Create a local draft workspace immediately.
2. Paste a brief, transcript, or other source text.
3. Optionally generate a suggested title, description, learning objective,
   audience, asset type, and duration with AI.
4. Review and edit every generated field.
5. Autosave the workspace in Neon.
6. Submit the completed setup to Kyron.
7. Poll Kyron and synchronize the latest status into Neon.
8. When complete, open the Kyron preview or editor.

## Supported inputs

- Asset types: `lesson`, `practice`, `scenario`
- Durations: `480`, `900`, `1800`, `3600` seconds
- Required course fields: name, description, learning objective, audience
- Optional source text: up to 50,000 characters

## V1 features

- Resumable, autosaved workspaces
- AI-assisted course setup with editable results
- Manual course setup
- Kyron draft creation
- Browser polling and explicit list synchronization
- Status filters: Editing, In progress, Complete, Needs attention
- Preview and editor handoff
- Temporary user-scoped workspace and draft history
- Clear loading, validation, empty, and error states

## Data ownership

- Kyron is the source of truth for asset generation and availability.
- Neon stores local workspaces, ownership, Kyron IDs, and last-observed status.
- A Kyron `404` marks a saved draft unavailable; it does not delete local
  history.
- Only workspace-created records appear in the management list.

## Next phase

- Replace the temporary identity with Neon Auth and Microsoft sign-in.
- Persist uploaded source files in private object storage and keep their
  metadata and workspace ownership in Neon.
- Extract structured content from DOCX, PDF, and PPTX files.
- Generate and persist editable course setup recommendations from uploaded
  files as well as pasted text.
- Let a batch contain multiple independently reviewable and resumable
  workspaces.
- Transfer supported PDF/PPTX source files to Kyron when a reviewed workspace
  is submitted.

Authentication is intentionally implemented before file persistence so every
workspace, file, and batch has a stable owner.

## Still deferred

- Kyron folder selection and placement
- Reading or editing generated sections and activities
- Publishing and Kyron asset deletion

The file-signing endpoint remains available for integration testing. The
attachment UI stays hidden until the persistent source-file workflow is
implemented.

## Acceptance criteria

- A user can leave and resume an unfinished workspace.
- AI suggestions remain optional and editable.
- A valid workspace creates a Kyron draft once submitted.
- The app displays and synchronizes generation status.
- Completed drafts expose preview and editor links.
- Credentials remain server-side.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass.
