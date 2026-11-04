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

1. Copy `.env.example` to `.env.local` and add the required values. For
   local work set `AUTH_MODE=access-code` and generate `SESSION_SECRET` and
   `TOKEN_ENCRYPTION_KEY` with the commands shown in `.env.example`.
2. Link the project with `npx vercel link`.
3. Run `npx vercel env pull .env.development.local --environment=development`
   so local server code can read private Vercel Blob files through OIDC.
4. Run `npm install`.
5. Run `npm run db:migrate`.
6. Run `npm run dev`.

### Sign-in

With `AUTH_MODE=access-code`, the app skips Clerk and accepts the preset codes
in `ACCESS_CODE_ADMIN` and `ACCESS_CODE_DEVELOPER`. This mode only serves
`localhost`. The admin can manage the Kyron connection. The developer uses the
product as a normal user. Each code has its own drafts, sources, and batches.

With `AUTH_MODE=clerk` (the default when unset), Clerk handles authentication
and records are scoped to the signed-in Clerk user ID.

### Kyron MCP connection (development)

The QA agent reads Kyron lesson content through Kyron MCP, which requires a
per-user OAuth sign-in. Kyron identifies the app by a public client metadata
file (CIMD), so that one file must be reachable over HTTPS even though the app
runs on localhost:

1. Sign in with the admin code and open **Kyron connection**.
2. Copy the JSON shown there into a secret GitHub gist named
   `kyron-client.json`.
3. Use the gist's raw address without the commit ID, for example
   `https://gist.githubusercontent.com/USER/GIST_ID/raw/kyron-client.json`,
   as both the file's `client_id` and `KYRON_OAUTH_CLIENT_ID` in `.env.local`.
4. Restart `npm run dev` and choose **Connect Kyron**.

Tokens are encrypted with `TOKEN_ENCRYPTION_KEY` and stored in
`.data/kyron-oauth.json`, which is git-ignored. The tool explorer lists every
Kyron MCP tool and runs only tools that Kyron marks read-only.

Kyron rejects a client file served as plain text: GitHub's raw gist address
returns `text/plain`, so serve the same gist through a JSON-serving mirror (for
example `https://gist.githack.com/USER/GIST_ID/raw/kyron-client.json`) or
GitHub Pages, and use that address as both `client_id` and
`KYRON_OAUTH_CLIENT_ID`. The app asks for `read write`; choose **Reconnect**
after upgrading so QA can write fixes. `QA_KYRON_WRITES` (default `test-only`)
and `QA_KYRON_VIDEO` (default `off`) control what QA may change.

### QA agent

Quality checks run inside generation: generating a course setup checks it
against the workspace sources and a revision agent (`gpt-6-luna`) applies safe
fixes, creating the Kyron draft waits for a passing check, and a finished Kyron
draft starts a check of the generated lesson. Results appear in **Quality
checks** on each workspace page, across workspaces under **QA agent**, and costs
and every content version (before/after per field) under **Logs**. See
[docs/QA_AGENT_PLAN.md](docs/QA_AGENT_PLAN.md).

Run `npm run qa:worker` in a second terminal (uses `CRON_SECRET`). It is the
production scheduler: it polls Kyron drafts that are still generating, advances
QA runs and updates each course's production job, so nothing depends on an
open page. **QA agent → Production** shows every course; **QA agent →
Defects** is the defect library.

The QA, content-version, log, production-job and defect tables are migrations `100`–`125`. On a database shared with
other branches, apply only those files instead of `npm run db:migrate`, which
re-runs every migration:

```bash
node --env-file=.env.local -e "const fs=require('fs');const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);(async()=>{for(const f of fs.readdirSync('database/migrations').filter(f=>/^1\d\d_/.test(f)).sort()){await sql.query(fs.readFileSync('database/migrations/'+f,'utf8'));console.log('applied',f)}})()"
```

## Project structure

- `app`: pages and thin Route Handlers
- `features`: browser-facing workflows and UI
- `server`: database, identity, AI, and Kyron integrations
- `database/migrations`: idempotent Neon schema migrations
- `components/ui`: shared shadcn/ui components
- `types`: browser/server API contracts

## Main routes

- `/sign-in`: access-code or Clerk sign-in, depending on `AUTH_MODE`
- `/qa`: QA agent checks, production jobs (`/qa/production`), escalations, defects (`/qa/defects`) and rubrics
- `/kyron`: admin Kyron MCP connection and tool explorer
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
