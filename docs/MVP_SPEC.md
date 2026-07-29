# Kyron Course Draft Launcher — MVP Specification

## Background

The CPE team currently uses Kyron Studio to generate Lesson, Practice,
and Scenario assets. The process includes entering course details,
uploading source materials, waiting for generation, reviewing the draft,
assembling videos, and publishing.

Kyron automates draft generation, but human review and video assembly
remain manual.

## Problem

Course creators repeatedly need to:

- Prepare a title and description
- Define the audience
- Write a learning objective
- Select an asset type and duration
- Upload PDF or PPTX source material
- Wait for Kyron generation
- Locate the editor and preview links

The MVP should automate these setup and draft-generation steps.

## MVP workflow

1. User uploads a PDF or PPTX.
2. User enters or AI-generates:
   - Name
   - Description
   - Learning objective
   - Audience
   - Asset type
   - Duration
3. Application requests signed upload information from Kyron.
4. Browser uploads the file directly to the signed URL.
5. Application creates the Kyron lesson collection.
6. Application polls the asset status.
7. When generation completes, display:
   - Editor URL
   - Preview URL
8. User continues editing manually in Kyron Studio.

## Supported asset types

- lesson
- practice
- scenario

## Supported durations

- 480 seconds
- 900 seconds
- 1800 seconds
- 3600 seconds

## MVP scope

- Course-information form
- Optional source-file upload
- Kyron draft creation
- Status polling
- Success and error handling
- Preview and editor links
- Server-side credential handling

## Non-goals

- Editing individual Kyron activities
- Automatically assembling videos
- Automatically publishing content
- Using undocumented Kyron `/api/v1` endpoints
- Learner analytics
- Batch generation
- Database persistence
- Browser extension

## Initial architecture

Next.js UI
→ Next.js Route Handlers
→ Kyron Public API `/api/v2`

The browser should poll the application status endpoint every 15–30
seconds. Vercel functions must not remain open while Kyron generates
the asset.

## Acceptance criteria

- A user can submit valid course information.
- A user can optionally upload a PDF or PPTX.
- API credentials never appear in client code.
- The application creates a Kyron draft successfully.
- The application displays generation progress.
- The application displays editor and preview links when complete.
- Errors are shown clearly without exposing secrets.