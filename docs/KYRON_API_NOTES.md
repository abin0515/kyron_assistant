# Kyron API Notes

## Public API

Base URL:

https://app.kyronlearning.com/api/v2

Authentication:

Authorization: Bearer <KYRON_API_KEY>

## Documented endpoints

- GET `/organizations/current`
- POST `/files`
- GET `/lesson_collections`
- POST `/lesson_collections`
- GET `/lesson_collections/{id}`
- POST `/lesson_collections/{id}/publish`
- DELETE `/lesson_collections/{id}`

## Course creation response

The creation endpoint returns:

- Asset ID
- Status
- Status message
- Preview URL
- Editor URL

Generation is asynchronous.

Observed statuses:

- started
- done
- error

## File upload flow

1. Call `POST /files`.
2. Receive a signed ID and direct-upload URL.
3. Upload file bytes directly to the signed URL.
4. Pass the signed ID as `alignment_content_signed_id` when creating
   the lesson collection.

Supported source files:

- PDF
- PPTX
- Maximum documented size: 250 MB

## Human-in-the-loop workflow

The API generates an editable instructional draft that may include:

- Videos
- Multiple-choice questions
- Clarifying conversations
- Narration
- Transcripts

A human must still:

- Review and edit generated content
- Check learning-objective alignment
- Assemble final videos
- Preview the result
- Approve publishing

## Internal API research

Kyron Studio appears to use undocumented `/api/v1` endpoints such as:

- GET `/api/v1/lessons/{lessonId}/lesson_sections`
- GET `/api/v1/lessons/{lessonId}/lesson_sections/{sectionId}/lesson_activities`

These use browser session authentication and CSRF tokens.

They must not be used in the MVP because they are undocumented and may
change without notice.