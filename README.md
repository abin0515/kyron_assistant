# Course Draft Workspace

Internal Next.js application for preparing, generating, and monitoring editable
course drafts.

## Current workflow

```text
Create workspace
→ Add source text or transcript
→ Generate and review course setup
→ Autosave changes
→ Submit to Kyron
→ Poll generation status
→ Preview or open the editor
```

Only workspace-created drafts appear in the management list. Kyron remains the
source of truth for generation status; Neon stores workspace data, ownership,
and the last synchronized Kyron state.

## Local setup

1. Copy `.env.example` to `.env.local` and add the required values.
2. Run `npm install`.
3. Run `npm run db:migrate`.
4. Run `npm run dev`.

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
- `/design-preview`: static fake-data UI reference; it is not a real workflow

## Known limitations

- File attachment UI is hidden because normal browser uploads are blocked by
  the current Kyron storage CORS policy.
- Folder placement, batch creation, and generated-content reads require
  additional Kyron API support.
- Publishing and Kyron asset deletion are intentionally not implemented.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```
