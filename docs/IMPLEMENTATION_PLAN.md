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

## File attachment status

Kyron `POST /files`, the signed upload contract, and server-to-server delivery
have been verified. Normal browser delivery is blocked by the storage bucket's
current CORS policy, so the UI remains hidden.

Future options:

1. Kyron allows the application origins and direct browser `PUT` requests.
2. The app stores private files and transfers supported files through a
   resumable backend workflow.

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

- One uploaded file is stored once and linked to its owning workspace.
- Neon stores filename, MIME type, size, storage key, extraction state, and
  analysis state.
- Extracted text and structured content are persisted so AI analysis can be
  reviewed or retried without re-uploading the file.
- A batch groups multiple workspaces; each workspace remains independently
  editable, submittable, retryable, and synchronized.
- For structured lesson-plan DOCX files, one document is initially treated as
  one draft and each table row as an activity. The user must confirm the draft
  boundary when the document is ambiguous.

## Next milestones

1. Enable Microsoft sign-in in Clerk and verify owner-scoped data isolation.
2. Add private source-file persistence and database metadata.
3. Extract structured DOCX, PDF, and PPTX content.
4. Generate and persist AI course setup recommendations from files.
5. Add batch workspace creation on the shared ingestion workflow.
6. Transfer supported source files to Kyron during submission.
7. Add Kyron folder placement and generated-content operations when public APIs
   become available.
8. Add pagination and background synchronization before larger-scale usage.

## Deferred engineering improvements

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
