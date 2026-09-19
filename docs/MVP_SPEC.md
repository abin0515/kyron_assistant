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
5. Mark an AI-generated setup as reviewed after it is acceptable.
6. Autosave the workspace in Neon.
7. Optionally choose one PDF or PPTX as the Kyron draft attachment.
8. Submit the completed setup and optional attachment to Kyron.
9. Poll Kyron and synchronize the latest status into Neon.
10. When complete, open the Kyron preview or editor.

## Supported inputs

- Asset types: `lesson`, `practice`, `scenario`
- Durations: `480`, `900`, `1800`, `3600` seconds
- Required course fields: name, description, learning objective, audience
- Optional source text: up to 50,000 characters

## V1 features

- Resumable, autosaved workspaces
- AI-assisted course setup with editable results
- Human-reviewed calibration snapshots for individual and batch AI recommendations
- Manual course setup
- Kyron draft creation
- Browser polling and explicit list synchronization
- Status filters: Editing, In progress, Complete, Needs attention
- Preview and editor handoff
- Clerk-authenticated, user-scoped workspace and draft history
- Private, user-scoped Source Library with upload, usage, and guarded deletion
- Optional PDF/PPTX attachment transfer during Kyron draft creation
- Clear loading, validation, empty, and error states

## Data ownership

- Kyron is the source of truth for asset generation and availability.
- Vercel Blob stores private source-file bytes.
- Neon stores local workspaces, source-file metadata and relationships, Kyron
  IDs, last-observed status, and course-setup calibration snapshots.
- Clerk user IDs scope every workspace and draft query.
- A Kyron `404` marks a saved draft unavailable. The user may then explicitly
  delete its local workspace and synchronization record.
- Only workspace-created records appear in the management list.

## Source Library

- Each user has a private, reusable source-file library without persisted
  folders. The folder picker can add supported files from a local folder in
  one queue; files remain flat in the library after upload.
- Supported upload formats are DOCX, PDF, and PPTX, up to 250 MB per file.
- AI text extraction is limited to 50 MB per file in V1 to bound server memory
  and execution time. Scanned PDFs require OCR and are not supported yet.
- File names are unique per user, ignoring case and surrounding whitespace.
  Folder selection reports hidden and unsupported files, and blocks the full
  queue when a selected name conflicts with another selected file or an
  existing library file.
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
- Files linked to active workspaces cannot be permanently deleted. Completed,
  failed, or unavailable drafts keep historical usage until the file is
  deleted, but do not block deletion. Removing a file from an active workspace
  removes only the relationship; deleting a workspace never deletes the
  library file.

## Batch creation

- A user creates a batch by selecting 1–20 Source Library files.
- Each selected file creates one normal, resumable workspace and becomes that
  workspace's AI input.
- DOCX, PDF, and PPTX text is extracted once and cached in Neon for reuse.
- Course setup generation runs for two workspaces at a time. Each result or
  error is persisted independently, so one failed file does not fail the batch.
- Each successful generation stores the AI baseline and prompt/model metadata
  in the same calibration table used by an individual workspace.
- Generated setups require human review before selected workspaces can be
  submitted to Kyron.
- PDF and PPTX sources may optionally be attached during review; DOCX is used
  only for AI input.
- Batch workspaces also appear in the ordinary Drafts list and continue through
  the same submission, polling, synchronization, preview, and editor workflow.
- Deleting a batch removes its unsubmitted workspaces. Workspaces already being
  submitted or submitted to Kyron are detached from the batch and remain in the
  ordinary Drafts list.

Authentication was implemented before file persistence so every
workspace, file, and batch has a stable owner.

## Course setup calibration

- Individual and batch AI generation store only the latest successful
  recommendation for each workspace's active review cycle, together with its
  prompt version and model.
- Human edits do not change the AI baseline. Marking a setup reviewed saves the
  current six course fields and authenticated reviewer identity.
- Editing an approved setup invalidates that approval. Successful regeneration
  replaces the baseline and starts a new review cycle; failed regeneration
  preserves the prior cycle.
- AI-generated workspaces require current review approval before submission.
  Manual workspaces continue to submit without calibration state.
- Successful Kyron submission stores the exact normalized course setup sent to
  Kyron, without temporary attachment identifiers.

## Still deferred

- Kyron folder selection and placement: supported by the updated public API,
  but not yet implemented or live-tested in the launcher. See
  [folder API notes](KYRON_API_NOTES.md#folder-support--document-reviewed-september-14-2026).
- Reading or editing generated sections and activities
- Publishing and Kyron asset deletion

The application transfers Kyron attachments from private Blob storage on the
server so browser CORS restrictions do not expose or block the signed upload.
The complete application flow has been manually verified by creating a Kyron
draft with a Source Library attachment.

## Acceptance criteria

- A user can leave and resume an unfinished workspace.
- AI suggestions remain optional and editable.
- A valid workspace creates a Kyron draft once submitted.
- A batch creates one independently reviewable workspace per selected file.
- PDF, PPTX, and DOCX source text can generate editable course setup fields.
- An optional selected PDF/PPTX is transferred and included in draft creation.
- The app displays and synchronizes generation status.
- Completed drafts expose preview and editor links.
- Credentials remain server-side.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass.
