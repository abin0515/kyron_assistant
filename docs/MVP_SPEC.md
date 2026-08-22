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
- Clerk-authenticated, user-scoped workspace and draft history
- Private, user-scoped Source Library with upload, usage, and guarded deletion
- Clear loading, validation, empty, and error states

## Data ownership

- Kyron is the source of truth for asset generation and availability.
- Vercel Blob stores private source-file bytes.
- Neon stores local workspaces, source-file metadata and relationships, Kyron
  IDs, and last-observed status.
- Clerk user IDs scope every workspace and draft query.
- A Kyron `404` marks a saved draft unavailable; it does not delete local
  history.
- Only workspace-created records appear in the management list.

## Source Library

- Each user has a private, reusable source-file library without folders.
- Supported ingestion formats are DOCX, PDF, and PPTX, up to 250 MB per file.
- File names are unique per user, ignoring case and surrounding whitespace.
- Each direct Blob upload uses a short-lived owner-scoped session. After the
  Blob transfer, an explicit completion request verifies the object, saves its
  metadata to Neon, and returns the list record; the Blob webhook provides an
  idempotent fallback if the browser closes first.
- A workspace-file relationship records one of two independent uses:
  `ai_input` or `kyron_attachment`.
- A file can be reused by multiple workspaces and can have both uses in the
  same workspace without duplicating its Blob object.
- A workspace can have multiple AI inputs, but at most one Kyron attachment.
- Only PDF and PPTX files can be sent to Kyron. DOCX remains AI-only unless
  Kyron documents support for it.
- AI setup and draft submission use the same file picker, which can select an
  existing library file or upload a new one. Highlighting prior AI inputs in
  the submission picker is deferred.
- Files linked to a workspace cannot be permanently deleted. Removing a file
  from a workspace removes only the relationship; deleting a workspace never
  deletes the library file.

## Next phase

- Enable Microsoft sign-in in Clerk and verify multi-account data isolation.
- Connect Source Library files to draft workspaces for AI input and Kyron
  attachment selection.
- Extract structured content from DOCX, PDF, and PPTX files.
- Generate and persist editable course setup recommendations from uploaded
  files as well as pasted text.
- Let a batch contain multiple independently reviewable and resumable
  workspaces.
- Transfer supported PDF/PPTX source files to Kyron when a reviewed workspace
  is submitted.

Authentication was implemented before file persistence so every
workspace, file, and batch has a stable owner.

## Still deferred

- Kyron folder selection and placement
- Reading or editing generated sections and activities
- Publishing and Kyron asset deletion

The file-signing endpoint remains available for integration testing. Workspace
attachment selection stays hidden until Source Library relationships and the
server-side Kyron transfer are implemented.

## Acceptance criteria

- A user can leave and resume an unfinished workspace.
- AI suggestions remain optional and editable.
- A valid workspace creates a Kyron draft once submitted.
- The app displays and synchronizes generation status.
- Completed drafts expose preview and editor links.
- Credentials remain server-side.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass.
