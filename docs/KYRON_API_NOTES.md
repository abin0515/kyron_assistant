# Kyron Public API Notes

## Connection

- Base URL: `https://app.kyronlearning.com/api/v2`
- Authentication: `Authorization: Bearer <KYRON_API_KEY>`
- Requests are scoped to the API key's organization.

The repository OpenAPI file is the source of truth for request and response
schemas: `docs/reference/openapi.yaml`.

## Used endpoints

- `GET /organizations/current`: authenticated organization name and ID
- `POST /lesson_collections`: create an asynchronous asset
- `GET /lesson_collections/{id}`: read generation status and URLs
- `POST /files`: request a signed file-upload target

The public API also documents list, publish, and delete operations. Publishing
and Kyron asset deletion are outside the V1 application.

## Draft lifecycle

Creation returns the full asset record immediately, including:

- `id`
- `status` and `status_message`
- `preview_url`
- `editor_url`

Observed statuses are `started`, `done`, and `error`. The preview and editor URLs
exist while generation is running, but the UI exposes them after completion.

Kyron remains the source of truth. A documented `404` can mean the asset was
deleted or the current API key cannot access it.

## File upload

1. Call `POST /files` with filename, byte size, Base64 MD5 checksum, and MIME
   type.
2. Receive `signed_id` plus `direct_upload.url` and required headers.
3. `PUT` the original PDF/PPTX bytes to the signed URL.
4. Pass `signed_id` as `alignment_content_signed_id` during creation.

Supported files are PDF and PPTX up to 250 MB.

Both browser-to-storage and server-to-server uploads were verified with a test
PDF. Normal browsers still block the direct `PUT` because the current storage
CORS policy does not allow the application origin. The application therefore
streams the selected private Blob through the server to Kyron's signed target.
The real workspace flow—selecting a Source Library file, transferring it, and
creating a draft with `alignment_content_signed_id`—has been manually verified.

The application's source ingestion may support additional formats such as
DOCX. That does not imply that Kyron accepts those files as attachments. A
DOCX can be parsed for AI course setup recommendations, but it must be converted
or omitted during Kyron submission unless Kyron confirms public DOCX support.

Private object storage holds the file bytes and Neon stores ownership, storage
references, processing state, extracted content, and a reusable MD5 checksum.
New uploads calculate and save the checksum when the file enters the Source
Library. Older records without a checksum retain a submission-time fallback
that calculates and caches it before the first attachment transfer. On
submission, the server reads a supported file as a stream, uploads it to
Kyron's signed target, and sends the returned `signed_id` with the draft
creation request.

Draft, Source Library, and Batch management endpoints are paginated. Draft
synchronization is bounded separately from the displayed page so active or
stale records are not skipped simply because they are not currently visible.

## API gaps for future workflow

The V1 cannot use the public API to:

- browse organization folders or place an asset in a selected folder
- read generated sections, activities, scripts, or transcripts
- perform detailed editor operations

Kyron Studio uses undocumented `/api/v1` endpoints for some of these features.
They must not be used by this application unless Kyron exposes and supports
them publicly.
