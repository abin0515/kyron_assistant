# Course Draft Workspace

Internal Next.js application for preparing, generating, and monitoring editable
course drafts.

## Current workflow

```text
Create workspace
→ Add source text or transcript
→ Generate and review course setup
→ Autosave changes
→ Optionally select one PDF or PPTX attachment
→ Submit to Kyron
→ Poll generation status
→ Preview or open the editor
```

Only workspace-created drafts appear in the management list. Kyron remains the
source of truth for generation status; Neon stores workspace data, ownership,
and the last synchronized Kyron state.

The Source Library stores private PDF, PPTX, and DOCX files in Vercel Blob and
owner-scoped metadata in Neon. Files can support AI analysis, and one PDF or
PPTX can be streamed from private storage to Kyron during draft submission.
Files linked to active workspaces cannot be deleted.

## Local setup

1. Copy `.env.example` to `.env.local` and add the required values.
2. Link the project with `npx vercel link`.
3. Run `npx vercel env pull .env.development.local --environment=development`
   so local server code can read private Vercel Blob files through OIDC.
4. Run `npm install`.
5. Run `npm run db:migrate`.
6. Run `npm run dev`.

Clerk handles authentication. Workspace and draft records are scoped to the
signed-in Clerk user ID.

## Project structure

- `app`: pages and thin Route Handlers
- `features`: browser-facing workflows and UI
- `server`: database, identity, AI, and Kyron integrations
- `database/migrations`: idempotent Neon schema migrations
- `components/ui`: shared shadcn/ui components
- `types`: browser/server API contracts

## Main routes

- `/sign-in`: Clerk authentication
- `/drafts`: workspace management and status filters
- `/drafts/new`: create an autosaved workspace
- `/drafts/[id]`: generate, edit, submit, and monitor a draft
- `/sources`: upload and manage reusable source files
- `/batches`: create and manage one workspace per selected source file
- `/design-preview`: static fake-data UI reference; it is not a real workflow

## Known limitations

- DOCX, PDF, and PPTX files up to 50 MB can be analyzed for AI course setup
  generation. Scanned PDFs require OCR and are not supported yet.
- Batch generation currently runs inside a request rather than a durable
  background workflow, so the initial limit is 20 workspaces per batch.
- Kyron folder selection and placement are documented by the public API but
  are not yet implemented or live-tested in the launcher. See the
  [folder API notes](docs/KYRON_API_NOTES.md#folder-support--document-reviewed-september-14-2026).
- Generated-content reads and detailed editing still require additional Kyron
  public API support.
- Publishing and Kyron asset deletion are intentionally not implemented.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```
