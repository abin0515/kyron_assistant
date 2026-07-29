# Kyron Course Draft Launcher — Implementation Plan

## 1. Repository assessment

The repository currently contains only planning and API-reference material:

- `AGENTS.md`
- `docs/MVP_SPEC.md`
- `docs/KYRON_API_NOTES.md`
- `docs/reference/openapi.yaml`

There is no Next.js application, package manifest, test configuration, environment
template, or Git metadata in the current directory. Implementation therefore starts
with a clean Next.js App Router scaffold rather than modifying an existing app.

The governing constraints are:

- Next.js App Router, TypeScript strict mode, Vercel, and Route Handlers.
- No database for the MVP.
- The browser polls; a Vercel function must not wait for Kyron generation.
- Kyron and AI credentials remain server-only.
- Every Kyron response is validated at runtime.
- Only documented Kyron `/api/v2` endpoints are used.
- Publishing and deletion are outside the MVP.

## 2. Verified Kyron API contract

Base URL: `https://app.kyronlearning.com/api/v2`

All Kyron calls use the server-side header:

```text
Authorization: Bearer <KYRON_API_KEY>
```

### 2.1 Request upload information

`POST /files`

Request:

```ts
type KyronCreateFileRequest = {
  blob: {
    filename: string;
    byte_size: number;
    checksum: string; // Base64-encoded binary MD5 digest
    content_type: string;
  };
};
```

Successful `201` response:

```ts
type KyronCreateFileResponse = {
  signed_id: string;
  direct_upload: {
    url: string;
    headers: Record<string, string>;
  };
};
```

The browser must `PUT` the original bytes to `direct_upload.url`, sending the
returned headers exactly. The `signed_id` is retained for draft creation.

### 2.2 Create a lesson collection

`POST /lesson_collections`

Request:

```ts
type KyronCreateLessonCollectionRequest = {
  name: string;
  description: string;
  learning_objective: string;
  audience: string;
  duration: 480 | 900 | 1800 | 3600;
  lesson_type?: "lesson" | "practice" | "scenario"; // Kyron default: "lesson"
  alignment_content_signed_id?: string;
};
```

The five fields other than `lesson_type` and
`alignment_content_signed_id` are required by the OpenAPI document. The
application should send `lesson_type` explicitly even though Kyron defaults it.

Successful `201` response:

```ts
type KyronLessonCollectionEnvelope = {
  lesson_collection: KyronLessonCollection;
};

type KyronLessonCollection = {
  id: number; // int64
  slug: string;
  name: string;
  description: string;
  published_at: string | null; // date-time
  created_at: string; // date-time
  updated_at: string; // date-time
  preview_url: string; // URI
  editor_url: string; // URI
  status: "started" | "error" | "done";
  status_message: string;
};
```

Generation is asynchronous and is documented as taking about ten minutes.

### 2.3 Read generation status

`GET /lesson_collections/{id}`

- `id` is a required int64 path parameter.
- `200` returns `KyronLessonCollectionEnvelope`.
- `401` and `404` return the documented problem response.

This is the only Kyron endpoint needed by the polling flow.

### 2.4 Error response

The documented media type is `application/problem+json`:

```ts
type KyronError = {
  title: string;
  status: number;
  errors?: Array<{
    message: string;
    pointer?: string;
    code?: string;
  }>;
};
```

Documented endpoint errors relevant to the MVP are:

- `/files`: `400`, `401`
- create collection: `400`, `401`
- get collection: `401`, `404`

The application must also handle undocumented but operationally possible
responses such as `403`, `429`, `5xx`, timeouts, non-JSON bodies, and JSON that
does not match the schema.

## 3. Specification and API conflicts or gaps

### Resolved from the repository

1. **Upload required versus optional.** The workflow begins with “User uploads,”
   while MVP scope and the OpenAPI field both say the source file is optional.
   Treat upload as optional. If omitted, do not call `/files` and do not send
   `alignment_content_signed_id`.
2. **Asset terminology.** The product calls the choices “asset types”; Kyron
   calls the request field `lesson_type`. Use `assetType` in UI-facing code and
   map it to `lesson_type` at the server boundary.
3. **Creation response shape.** The notes summarize fields as if they are
   top-level. OpenAPI is authoritative: they are nested under
   `lesson_collection`.
4. **Links during generation.** OpenAPI requires `preview_url` and `editor_url`
   for every collection state, although the MVP only displays them at
   completion. Validate them on every response, retain them, and reveal them
   only when `status === "done"`.
5. **Publishing and deletion.** Both endpoints are documented, but are explicit
   non-goals. Do not create application routes, UI actions, or client helpers
   for them.

### Gaps that require validation or a product decision

1. **Direct-upload CORS is not documented.** Browser-to-signed-URL upload
   requires the storage target to permit the application origin, `PUT`, and all
   signed headers. Verify this against Kyron in an integration environment. If
   it is unsupported, the specified browser-direct flow cannot work unchanged;
   a streaming server proxy would need separate approval and Vercel-limit
   analysis.
2. **MD5 is required but the standard Web Crypto API does not provide MD5.**
   Use a small, audited browser library with incremental/chunked MD5 support so
   a 250 MB file does not need an additional full-size copy in memory. This is
   checksum use, not password/security hashing.
3. **“Exactly” the returned upload headers needs a real integration test.**
   Browsers add transport-managed headers that application JavaScript cannot
   suppress. The implementation can ensure it adds only Kyron-returned headers;
   Kyron/storage must accept normal browser-managed headers.
4. **AI-generated form content is underspecified and deferred.** No provider,
   model, input contract, prompt behavior, or output schema is defined. The
   initial build will support manual entry only. AI assistance is outside the
   initial implementation and requires a separate future decision.
5. **String limits are absent.** OpenAPI specifies no minimum or maximum lengths
   for the text fields. Apply sensible application limits for usability and
   request protection, but confirm them through Kyron integration testing rather
   than presenting them as Kyron limits.
6. **Allowed MIME values are descriptive, not enumerated.** Accept `.pdf` and
   `.pptx` with `application/pdf` and the standard PPTX MIME type, reject other
   combinations, and treat Kyron as the final authority. The signing route sees
   metadata, not bytes, so it cannot independently verify file signatures.
7. **Signed upload lifetime and retry semantics are undocumented.** On a failed
   direct upload, request a fresh signed target rather than assuming a URL can
   be reused. Confirm expiry and reuse behavior during integration testing.

None of these gaps blocks scaffolding or the manual-entry draft workflow.

## 4. Proposed application architecture

```text
Browser UI
  ├─ validates form and optional file metadata
  ├─ computes file MD5 incrementally
  ├─ asks this app for a signed upload target
  ├─ uploads bytes directly to signed storage
  ├─ asks this app to create the Kyron draft
  └─ polls this app for normalized draft status
             │
             ▼
Next.js Route Handlers (Node.js runtime)
  ├─ validate browser input
  ├─ add server-only Kyron bearer credential
  ├─ call only documented Kyron /api/v2 endpoints
  ├─ validate every Kyron success/error response
  └─ return a stable, sanitized application contract
             │
             ▼
Kyron Public API /api/v2
```

Suggested source layout:

```text
app/
  layout.tsx
  page.tsx
  api/
    uploads/sign/route.ts
    drafts/route.ts
    drafts/[id]/route.ts
components/
  course-draft-form.tsx
  source-file-field.tsx
  generation-status.tsx
  draft-links.tsx
lib/
  client/
    file-checksum.ts
    direct-upload.ts
    poll-draft.ts
  kyron/
    client.ts
    schemas.ts
    types.ts
    errors.ts
  validation/
    app-schemas.ts
  env.ts
  api-response.ts
types/
  api.ts
```

Keep `lib/kyron/*` server-only (for example with `import "server-only"`).
`KYRON_API_KEY` and an optional configurable `KYRON_API_BASE_URL` are read and
validated in server code. Only the base URL should have a safe production
default; the key must have no default and must never use a `NEXT_PUBLIC_` name.

Use one runtime-schema library (for example Zod) for inbound application data,
environment data, and outbound Kyron data. Infer TypeScript types from schemas
where practical so compile-time and runtime definitions do not drift.

## 5. Route Handler contracts

All application responses use JSON and set `Cache-Control: no-store`. Route
handlers run on the Node.js runtime.

### `POST /api/uploads/sign`

Browser request:

```ts
type SignUploadRequest = {
  filename: string;
  byteSize: number;
  checksum: string;
  contentType:
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.presentationml.presentation";
};
```

Responsibilities:

- Validate filename, positive byte size, maximum 250 MB, allowed extension/MIME
  pairing, and Base64 MD5 shape.
- Translate into the Kyron `{ blob: ... }` request.
- Call `POST /files` with the bearer token.
- Validate the complete `201` response.
- Return a normalized `{ signedId, upload: { url, headers } }`.
- Never log the signed URL, returned signed headers, bearer token, or signed ID.

The signed URL is necessarily returned to the browser to enable direct upload.
It is short-lived capability data, not the Kyron credential.

### `POST /api/drafts`

Browser request:

```ts
type CreateDraftRequest = {
  name: string;
  description: string;
  learningObjective: string;
  audience: string;
  assetType: "lesson" | "practice" | "scenario";
  duration: 480 | 900 | 1800 | 3600;
  alignmentContentSignedId?: string;
};
```

Responsibilities:

- Strictly validate and normalize input; reject unknown fields.
- Map camelCase application fields to Kyron snake_case fields.
- Call `POST /lesson_collections`.
- Validate the response envelope and collection.
- Return the normalized application draft shape with `201`.

### `GET /api/drafts/[id]`

Responsibilities:

- Accept only a positive decimal int64-style identifier; reject malformed input
  before contacting Kyron.
- Call `GET /lesson_collections/{id}`.
- Validate and normalize the response.
- Return the current draft state.

There is intentionally no long-running job route and no server-side status
store. The Kyron collection ID is the polling handle.

## 6. Application-facing TypeScript model

Keep Kyron transport types private to the server and expose a smaller stable
contract:

```ts
type DraftStatus = "started" | "done" | "error";

type Draft = {
  id: number;
  name: string;
  status: DraftStatus;
  statusMessage: string;
  previewUrl: string;
  editorUrl: string;
  createdAt: string;
  updatedAt: string;
};

type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UPLOAD_FAILED"
  | "KYRON_UNAUTHORIZED"
  | "KYRON_NOT_FOUND"
  | "KYRON_RATE_LIMITED"
  | "KYRON_UNAVAILABLE"
  | "KYRON_INVALID_RESPONSE"
  | "REQUEST_TIMEOUT"
  | "INTERNAL_ERROR";

type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    fieldErrors?: Record<string, string[]>;
    requestId?: string;
  };
};
```

Never pass raw upstream response bodies or exception messages to the browser.
Server logs may contain request IDs, route, upstream status, safe error codes,
and schema-validation paths, but not credentials, signed upload details, file
contents, or user-entered course content by default.

## 7. File-upload flow

1. The user optionally selects one PDF or PPTX.
2. The client immediately validates extension, MIME metadata, and size
   (`<= 250 * 1024 * 1024` bytes).
3. At submission, compute Base64 MD5 incrementally in the browser. Show distinct
   “Preparing file” progress and allow cancellation.
4. Call `POST /api/uploads/sign` with file metadata and checksum.
5. Validate the application response on the client.
6. `PUT` the original `File` to the returned URL, adding only the returned
   headers. Do not add an application default `Content-Type`; the signature
   contract controls headers.
7. Treat any non-2xx storage response or network/CORS failure as upload failure.
   Do not create a draft after upload failure.
8. Call `POST /api/drafts`, including `alignmentContentSignedId` only after a
   successful upload.
9. Discard the signed URL and headers from UI state as soon as upload finishes.

Use an `XMLHttpRequest` uploader isolated behind the direct-upload helper so the
UI can show byte-based upload percentage. Incremental hashing should also report
percentage. Signing, draft creation, and other short operations remain
indeterminate. This does not affect the server contract.

The state machine should prevent duplicate submission:

```text
idle → validating → hashing? → signing? → uploading? → creating
     → polling → done
                    └───────→ generation_error
any active step ────────────→ request_error → retry
```

The `?` states are skipped when no file is selected.

## 8. Polling strategy

- Begin polling only after draft creation returns an ID.
- Poll `GET /api/drafts/{id}` every 20 seconds, within the specified 15–30
  second range.
- Do not overlap requests. Schedule the next poll only after the previous request
  settles.
- Stop permanently for `done` or Kyron status `error`.
- Pause while the page is hidden and immediately refresh when it becomes visible.
- Cancel in-flight work with `AbortController` on unmount, new submission, or
  explicit cancel.
- For transient network errors, `429`, or `5xx`, use bounded exponential backoff
  (for example 20, 40, then 60 seconds maximum) with jitter and honor
  `Retry-After` when available.
- Treat application validation errors, `401`, and `404` as terminal for that
  polling session.
- After a bounded number of consecutive transient failures, pause automatic
  polling and show a “Check again” action. This prevents an endless noisy loop
  while preserving the draft ID.
- Show elapsed time and Kyron's sanitized `statusMessage`; do not estimate a
  percent because the API supplies no progress value.
- Since there is no database, a full reload loses in-memory state. Put the
  non-secret draft ID in the URL query string (for example `/?draft=123`) after
  creation so reload/resume can restart status polling.

The browser must not poll Kyron directly because that would expose the API key.

## 9. Error and UI behavior

Separate errors by stage so recovery is clear:

- **Form error:** preserve inputs and focus the first invalid field.
- **Checksum/signing/upload error:** preserve form and file selection where the
  browser permits; retry the entire sign/upload stage with a fresh signed URL.
- **Creation error:** preserve the completed-upload signed ID in memory and allow
  creation retry during the page session. If Kyron's consumption semantics are
  uncertain, offer a full upload retry after a repeated failure.
- **Generation error:** stop polling, show Kyron's safe status message, retain
  draft ID, and link to the editor only if product policy permits links for an
  errored draft.
- **Polling transport error:** distinguish temporary connection trouble from a
  terminal response and offer manual retry.
- **Invalid upstream response:** show a generic service-response error and log
  safe schema diagnostics server-side.

Suggested HTTP mapping:

- Invalid application input: `400`
- Kyron authentication/configuration failure: `502` to the browser (do not expose
  whether a secret exists)
- Kyron not found: `404`
- Kyron rate limit: `503` plus safe `Retry-After`
- Kyron/network timeout or `5xx`: `503`
- Invalid Kyron response: `502`
- Unexpected application failure: `500`

Use accessible live regions for status changes, keyboard-accessible controls,
visible field errors, and links that clearly indicate they open Kyron Studio.

## 10. Security and operational controls

- Keep all credentials in Vercel server environment variables.
- Mark Kyron modules server-only and review the client bundle for secret names.
- Use request timeouts for every upstream call.
- Apply a conservative same-origin request check to mutating application routes.
- Set body-size expectations; metadata routes should accept only small JSON.
- Never accept an upload target URL from the browser. Only return the URL received
  from Kyron and use it client-side for that upload.
- Avoid logging bearer headers, signed URLs/headers/IDs, or raw upstream bodies.
- Add request correlation IDs without returning sensitive diagnostics.
- Do not render user strings as HTML.
- Add basic response security headers through Next.js configuration or Vercel.
- Consider platform/WAF rate limiting before broad internal rollout. An
  in-memory limiter is not dependable across Vercel instances.
- Enable Vercel Authentication for preview deployments during the initial build.
  A separate production identity decision is still required before the launcher
  is exposed beyond the preview pilot.

## 11. Implementation milestones

### Milestone 0 — Resolve deployment prerequisites

- Enable and verify Vercel Authentication for preview deployments.
- Obtain a non-production Kyron API key and confirm Vercel environment setup.
- Verify signed-upload CORS, browser-managed headers, URL expiry, and retry
  behavior with PDF and PPTX samples.
- Keep AI generation out of the initial build.

### Milestone 1 — Scaffold and quality gates

- Create the Next.js App Router TypeScript application with strict mode.
- Add lint, typecheck, unit-test, and environment-validation setup.
- Add `.env.example` containing names only, never credentials.
- Establish server-only boundaries and shared application contracts.

Exit criteria: the empty app passes `npm run lint` and `npm run typecheck`.

### Milestone 2 — Kyron server adapter

- Implement runtime schemas for every used Kyron success and error response.
- Implement authenticated, timed, no-store Kyron requests.
- Implement error normalization and safe structured logging.
- Unit-test schema rejection and HTTP/error mappings with mocked responses.

### Milestone 3 — Route Handlers

- Implement and test upload-signing, draft-creation, and draft-status routes.
- Test validation, field mapping, malformed IDs, all documented errors, transient
  errors, non-JSON responses, and structurally invalid JSON.
- Confirm no publish/delete route exists.

### Milestone 4 — Form and optional direct upload

- Build the accessible course form and constrained selectors.
- Implement incremental MD5 and direct `PUT` upload.
- Add stage-specific loading, cancellation, retry, and error UI.
- Test no-file, PDF, PPTX, oversize, wrong-type, CORS failure, and storage failure
  paths.

### Milestone 5 — Draft creation and polling

- Connect successful upload (or no upload) to draft creation.
- Implement non-overlapping visibility-aware polling and backoff.
- Resume via the draft ID in the URL.
- Add terminal success/error views and editor/preview links.

### Milestone 6 — Deferred AI assistance

This milestone is explicitly deferred and is not part of the initial delivery.
If it is approved later:

- Choose the provider, model, source-input policy, and generated fields.
- Add a separate server-only generation route with a strict structured-output
  schema.
- Make AI assistance optional and editable; never block manual submission.
- Add timeout, rate-limit, invalid-output, and safe-error handling.

### Milestone 7 — Integration, security, and release

- Run end-to-end tests against a safe Kyron organization.
- Confirm credentials and user content are absent from browser bundles/logs.
- Test deployment authentication, accessibility, responsive layout, and Vercel
  timeout behavior.
- Document environment variables, operations, and known Kyron constraints.
- Run the required `npm run lint` and `npm run typecheck` before handoff.

## 12. Test strategy

- **Schema unit tests:** valid fixtures plus missing fields, unknown statuses,
  invalid dates/URLs, fractional/unsafe IDs, and malformed error envelopes.
- **Route tests:** request validation, Kyron mapping, secret-header injection,
  timeout behavior, safe errors, and cache headers.
- **Client unit tests:** state transitions, optional-upload branching, backoff,
  cancellation, and terminal polling behavior.
- **Component tests:** field errors, disabled/active states, status announcements,
  retry actions, and conditional links.
- **End-to-end tests:** manual no-file creation; PDF and PPTX upload; generation
  success; generation error; refresh/resume; transient polling failure.
- **Release checks:** `npm run lint`, `npm run typecheck`, tests, and a production
  build.

## 13. Product decisions

Decisions recorded for the initial build:

1. Protect preview deployments with Vercel Authentication.
2. Defer AI-generated course information; the initial form uses manual entry.
3. Show percentage progress for browser-side hashing and direct upload. Use
   indeterminate stage indicators where numeric progress is unavailable.

Still required before a broader production rollout:

1. Choose the long-term production identity and authorization mechanism.
2. If AI assistance is later approved, define its provider, model, source-input
   policy, generated fields, and institutional data-governance requirements.
