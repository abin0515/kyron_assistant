# Course Draft Workspace — Implementation Plan

## Architecture

```text
Next.js UI
  → Route Handlers
      ├→ workspace and draft services
      │   └→ Neon PostgreSQL
      ├→ Kyron public API
      └→ OpenAI API
```

- `app` contains pages and thin HTTP controllers.
- `features` contains browser APIs, hooks, and UI grouped by workflow.
- `server` contains server-only business logic and integrations.
- `types/api.ts` defines contracts shared across the browser/server boundary.

Credentials never reach the browser. Kyron and AI responses are validated
before use.

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
2. The app stores private files temporarily and transfers them through a
   resumable backend workflow.

## Next milestones

1. Replace the temporary identity with production authentication.
2. Add Kyron folder discovery and placement when public endpoints are available.
3. Choose and implement the production attachment workflow.
4. Add batch workspace creation.
5. Add generated-content reads and selected editor operations when supported.
6. Add pagination and background synchronization before larger-scale usage.

## Release checklist

- Apply all database migrations.
- Configure server-only environment variables in Vercel.
- Protect preview deployments with Vercel Authentication.
- Manually verify create, autosave, resume, submit, polling, refresh, preview,
  editor, unavailable, and workspace deletion flows.
- Run `npm run lint`, `npm run typecheck`, and `npm run build`.
