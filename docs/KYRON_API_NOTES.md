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

## Folder support — document reviewed September 14, 2026

The updated public API documents folder management and optional folder placement
at course creation. These capabilities are not yet implemented in the launcher.
The new folder endpoints and creation field have not yet been tested against
the live API.

| Endpoint | Documented behavior |
| --- | --- |
| `GET /asset_folders` | List direct child folders, with optional `parent_id`, `page`, and `per_page`. Omitting `parent_id` lists top-level folders. |
| `POST /asset_folders` | Create a folder with a required `name` and optional `parent_id`. The default parent is the organization's root folder. |
| `GET /asset_folders/{id}` | Return the folder itself, its direct child folders, and its direct lesson collections. |
| `PATCH /asset_folders/{id}` | Rename a folder using `name` or move the folder using `parent_id`. |
| `DELETE /asset_folders/{id}` | Delete an empty folder. The organization's library folder cannot be deleted. |

`AssetFolder` contains `id`, `name`, `parent_id`, `created_at`, and `updated_at`.
The organization's root folder has a null `parent_id`. Folder names must be
unique among siblings; a duplicate name on creation returns `422`. Deleting
a nonempty folder or the library folder also returns `422`.

Folder detail returns `asset_folder`, `asset_folders`, `lesson_collections`, and
`meta`. Child folders and lesson collections share one pagination sequence,
even though they appear in separate arrays. The parent `asset_folder` stays
the same across pages. Listing children does not recursively list descendants.

### Creating a course in a folder

`POST /lesson_collections` now accepts optional integer `asset_folder_id`.
Omitting it creates the course at the top level of the organization's library,
which preserves the launcher's existing behavior. An inaccessible or missing
target folder returns `404`.

The five required fields remain `name`, `description`, `learning_objective`,
`audience`, and `duration`. Asset types, duration choices, attachment limits,
and the `LessonCollection` response fields are unchanged. The response schema
does not include `asset_folder_id`, so it does not confirm placement directly.

Kyron folders organize generated assets in Kyron Studio. They do not add folder
storage to the launcher's Source Library or change its Blob upload workflow.
See [Next milestones](IMPLEMENTATION_PLAN.md#next-milestones) for the proposed
integration steps.

### Publishing response update

`POST /lesson_collections/{id}/publish` now documents `409` when publishing is
already in progress. Publishing remains outside the implemented launcher flow.

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

The current public API document still does not provide operations to:

- read generated sections, activities, scripts, or transcripts
- perform detailed editor operations
- move an existing lesson collection to another folder; the folder `PATCH`
  operation moves folders only

Kyron Studio uses undocumented `/api/v1` endpoints for some of these features.
They must not be used by this application unless Kyron exposes and supports
them publicly.
