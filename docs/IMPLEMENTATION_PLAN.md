# Course Draft Workspace — Implementation Plan

## Architecture

```text
Next.js UI
  → Route Handlers
      ├→ authentication
      ├→ workspace, file, batch, and draft services
      │   ├→ Neon PostgreSQL
      │   └→ private object storage
      ├→ Kyron public API
      └→ OpenAI API
```

- `app` contains pages and thin HTTP controllers.
- `features` contains browser APIs, hooks, and UI grouped by workflow.
- `server` contains server-only business logic and integrations.
- `types/api.ts` defines contracts shared across the browser/server boundary.

Credentials never reach the browser. Kyron and AI responses are validated
before use.

Database records store ownership, workflow state, extracted content, and file
metadata. Uploaded file bytes belong in private object storage, not PostgreSQL.

## Implemented V1 flow

### 1. Workspace creation and editing

- `POST /api/draft-workspaces` creates an owner-scoped workspace.
- `GET /api/draft-workspaces/[id]` resumes it.
- `PATCH /api/draft-workspaces/[id]` supports debounced autosave.
- `DELETE /api/draft-workspaces/[id]` deletes only an unsubmitted workspace and
  requires explicit UI confirmation.

### 2. AI course setup

- `POST /api/drafts/generate-course-setup` accepts source text.
- OpenAI returns a structured suggestion for all course fields.
- The user reviews and edits the result before submission.

### 3. Kyron submission

- `POST /api/draft-workspaces/[id]/submit` validates the saved workspace.
- An optional linked PDF/PPTX is read from private Blob storage, checksummed,
  streamed to Kyron's signed target, and referenced by `signed_id`.
- The server creates the Kyron asset and requires successful Neon persistence.
- The workspace stores the returned Kyron draft ID.
- Submission state prevents ordinary duplicate clicks and concurrent requests.

### 4. Polling and synchronization

- `GET /api/drafts/[id]` reads Kyron and persists the latest normalized state.
- The browser polls active drafts every 20 seconds with bounded retry backoff.
- `GET /api/drafts` reads saved Kyron state from Neon.
- `POST /api/drafts/sync` refreshes up to 50 records in batches of four.
- Kyron `404` responses mark a draft unavailable without deleting local history.

### 5. Management UI

- The list displays workspace-created records only.
- Client-side status filters avoid extra network requests.
- Completed records hand off to Kyron preview and editor pages.
- Submitted workspaces are locked against further local editing.

### 6. Source Library

- Private PDF, PPTX, and DOCX files upload directly to Vercel Blob through
  short-lived, owner-authorized upload tokens.
- The browser then calls `POST /api/source-files/complete`; the server verifies
  Blob metadata, finalizes Neon synchronously, and returns the real list item.
- The Blob completion webhook calls the same idempotent finalizer as a fallback
  when the browser leaves before acknowledgement.
- Neon stores owner-scoped metadata and workspace relationships.
- `/sources` lists, searches, filters, and sorts saved files.
- Workspace pages can select, upload, and unlink multiple AI source files.
- Workspace setup can select or upload one PDF/PPTX for Kyron submission.
- Usage details group links by workspace and distinguish Active from Previously
  used relationships.
- Guarded deletion rejects active links. Historical links are removed with the
  file record before its Blob object is deleted.

## Data model

### `draft_workspaces`

Stores editable setup fields, owner identity, autosave state, submission state,
and the optional Kyron draft ID.

### `drafts`

Stores normalized Kyron metadata, generation status, availability, owner
identity, preview/editor URLs, and synchronization timestamps.

The workspace references its Kyron record after successful submission.

## Error model

Application APIs return:

```ts
type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    fieldErrors?: Record<string, string[]>;
    requestId?: string;
  };
};
```

Upstream credentials, signed URLs, raw bodies, and internal diagnostics must not
appear in client responses or logs.

## File attachment flow

Kyron `POST /files`, the signed upload contract, and server-to-server delivery
are implemented. Normal browser delivery is blocked by the storage bucket's
current CORS policy, so the server streams the selected private Blob to the
signed target before creating the draft.

The complete workspace flow has been manually verified against Kyron with a
real Source Library attachment.

Application ingestion and Kyron attachment delivery are separate concerns.
The app may parse DOCX, PDF, and PPTX for AI recommendations, while the current
Kyron public upload workflow accepts only PDF and PPTX.

## Authentication

- Clerk provides sign-in, session management, and the user menu.
- Next.js Proxy protects workspace, batch, draft, and related API routes.
- A server-only `getCurrentUser` helper resolves the authenticated Clerk user.
- Existing text `created_by_id` columns store Clerk user IDs and scope queries.
- Vercel Authentication remains separate preview-deployment protection.
- Microsoft OAuth and any tenant access policy are configured in Clerk.

## Source-file and batch model

- One uploaded file is stored once and can be linked to multiple owner-scoped
  workspaces.
- Neon stores filename, MIME type, size, storage key, extraction state, and
  analysis state.
- Extracted text is persisted so AI analysis can be retried without downloading
  and parsing the file again.
- A batch groups multiple workspaces; each workspace remains independently
  editable, submittable, retryable, and synchronized.
- V1 maps one selected file to one workspace. It does not infer modules,
  activities, or multiple draft boundaries from a document.

## Batch implementation

- `draft_batches` owns a named group of normal `draft_workspaces`.
- Creating a batch maps each selected Source Library file to one workspace with
  an `ai_input` relationship.
- The shared extraction service supports DOCX, PDF page text, and PPTX slide
  text plus speaker notes. Extracted text is cached on the source-file record.
- Setup generation is limited to 20 workspaces per batch and runs with two
  concurrent workers. Workspace claims prevent duplicate generation and can be
  reclaimed after 10 minutes if a request stops unexpectedly.
- Each workspace stores its own setup state, message, generated fields, review
  state, attachment choice, Kyron submission, and synchronization result.
- This MVP starts generation from a Batch detail request; a durable queue or
  workflow runner is deferred until usage requires generation to continue
  independently of a web request.

## Next milestones

1. Apply and manually verify the batch migrations and end-to-end flow with
   representative DOCX, PDF, and PPTX files.
2. Enable Microsoft sign-in in Clerk and verify owner-scoped data isolation.
3. Add durable background jobs before increasing the batch limit or expected
   processing time.
4. Add Kyron folder placement and generated-content operations when public APIs
   become available.
5. Add pagination and background synchronization before larger-scale usage.

## Deferred engineering improvements

- Move Batch course-setup generation out of the Batch detail request and into
  a durable background job. The current flow starts generation when the user
  opens the detail page, so it is not guaranteed to continue after the browser
  leaves or the request ends.
- Add a concurrency limit to selected Kyron draft submissions. Setup generation
  already uses two workers, but the current submission flow can send every
  selected ready workspace concurrently.
- Cancel the in-flight workspace creation request when `/drafts/new` unmounts,
  preventing an abandoned loading page from creating an orphaned workspace or
  triggering a late redirect.

## Release checklist

- Apply all database migrations.
- Configure server-only environment variables in Vercel.
- Protect preview deployments with Vercel Authentication.
- Manually verify create, autosave, resume, submit, polling, refresh, preview,
  editor, unavailable, and workspace deletion flows.
- Run `npm run lint`, `npm run typecheck`, and `npm run build`.
