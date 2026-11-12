# Course Draft Workspace

Internal Next.js application for preparing, generating, and monitoring editable
course drafts.

## Current workflow

```text
1. Upload & prompt  – upload the source file (a PDF or PPTX also goes to Kyron) and write the generation prompt
2. Plan             – AI drafts the outcome, audience, title, description, asset type and length
                      (Brief / Normal / Detailed); review and edit, then create the Kyron draft
3. Template (Kyron) – Kyron generates the lesson; QA checks it and applies its fixes automatically
4. Review & approve – /drafts/[id]/review shows the template by topic and the module report;
                      approve it to start rendering (uses Kyron credits)
5. Video            – Kyron renders; QA checks the narration
```

Length targets per content type (minutes), checked by QA:

| Content | Brief | Normal | Detailed |
|---|---|---|---|
| Video (one per topic) | 1 | 5 | 15 |
| Activity | 3 | 8 | 20 |
| Practice / quiz | 5 | 10 | 30 |

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
3. Connect the Vercel Blob store to the project for Development (Vercel →
   Storage → the store → Connect Project), then run
   `npx vercel env pull .env.development.local --environment=development` so
   local server code can reach private Vercel Blob files through OIDC. It
   brings `BLOB_WEBHOOK_PUBLIC_KEY`, which every upload needs, and a
   short-lived `VERCEL_OIDC_TOKEN`; pull again when uploads say they aren't
   set up. Always name the file: a bare `vercel env pull` overwrites
   `.env.local`. For `npm run dev`, values in `.env.development.local` win
   over `.env.local`, so after each pull keep only the `BLOB_*` and `VERCEL_*`
   entries in it and delete anything else (such as `DATABASE_URL` or
   `AUTH_MODE`).
4. Run `npm install`.
5. Run `npm run db:migrate`.
6. Run `npm run dev`.

### Sign-in

With `AUTH_MODE=access-code`, the app skips Clerk and accepts the preset codes
in `ACCESS_CODE_ADMIN` and `ACCESS_CODE_DEVELOPER`. Short codes only work on
`localhost`; any other host needs both codes to be at least 24 characters. The admin can manage the Kyron connection. The developer uses the
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

Tokens are encrypted with `TOKEN_ENCRYPTION_KEY` and stored in Neon
(`kyron_mcp_connections`, one row), so the sign-in survives restarts and works
on Vercel. A sign-in saved by the earlier file store (`.data/kyron-oauth.json`)
is imported automatically the first time it is needed. **Kyron → Tools** lists
every Kyron MCP tool by area and runs only tools that Kyron marks read-only;
**Kyron → Course content** shows each draft as Kyron returns it and every QA
revision.

Kyron rejects a client file served as plain text: GitHub's raw gist address
returns `text/plain`, so serve the same gist through a JSON-serving mirror (for
example `https://gist.githack.com/USER/GIST_ID/raw/kyron-client.json`) or
GitHub Pages, and use that address as both `client_id` and
`KYRON_OAUTH_CLIENT_ID`. The app asks for `read write`; choose **Reconnect**
after upgrading so QA can write fixes. `QA_KYRON_WRITES` (default `test-only`)
and `QA_KYRON_VIDEO` (default `off`) control what QA may change.

### Model calls (Vercel AI Gateway)

All model calls use `gpt-6-luna` through the OpenAI Responses API with the
same reasoning levels (medium; high for the independent verifier), strict JSON
output and `store: false`. To route them through Vercel AI Gateway:

1. In Vercel, open **AI Gateway → API Keys** and create a key.
2. Add it as `AI_GATEWAY_API_KEY` in `.env.local` and in the Vercel project's
   environment variables, then restart `npm run dev`.

With the key set, requests go to `https://ai-gateway.vercel.sh/v1` as
`openai/gpt-6-luna`, pinned to OpenAI as the provider; without it they go to
OpenAI directly with `OPENAI_API_KEY`. **Logs → Usage** records each call's
route. Transcribing an uploaded video (`gpt-4o-transcribe`) is not available
through the gateway's OpenAI API, so it keeps using `OPENAI_API_KEY`; without
that key the narration check is reported as not tested.

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

On Vercel, `vercel.json` runs the same tick every minute as a Cron job
(`GET /api/qa/driver`, authenticated with `CRON_SECRET`). Per-minute Cron jobs
need a Vercel Pro plan; Hobby allows one run a day.

The QA, content-version, log, production-job, defect and Kyron sign-in tables
are migrations `100`–`128`. On a database shared with
other branches, apply only those files instead of `npm run db:migrate`, which
re-runs every migration:

```bash
node --env-file=.env.local -e "const fs=require('fs');const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);(async()=>{for(const f of fs.readdirSync('database/migrations').filter(f=>/^1\d\d_/.test(f)).sort()){await sql.query(fs.readFileSync('database/migrations/'+f,'utf8'));console.log('applied',f)}})()"
```

## Deploying to Vercel

The app is entirely Next.js (App Router pages, Route Handlers and `proxy.ts`);
`next build` produces everything Vercel runs. `scripts/migrate.mjs` and
`scripts/qa-worker.mjs` are local tools only. Before the first deploy:

0. **Commit everything:** stage with `git add -A` (not `git commit -a`, which
   skips new files), then check that `git status --short` lists nothing new.
   The deploy needs files that start untracked, such as `vercel.json`,
   `app/oauth/` and new migrations.
1. **Sign-in codes:** keep `AUTH_MODE=access-code` and set two new codes of at
   least 24 characters, one for the admin and one shared by staff (shorter
   codes only work on localhost; the deployed site refuses to serve with them).
   Generate each with
   `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
   Clerk (`AUTH_MODE=clerk`) can replace the codes later.
2. **Environment variables:** add to the Vercel project for **Production
   only** (untick Preview and Development, which Vercel's form selects by
   default; otherwise a local pull would bring the production database and
   codes onto your machine) `AUTH_MODE`, `ACCESS_CODE_ADMIN`, `ACCESS_CODE_DEVELOPER`, `SESSION_SECRET`,
   `DATABASE_URL` (the production database, step 3), `TOKEN_ENCRYPTION_KEY`,
   `CRON_SECRET`, `KYRON_API_KEY`, `KYRON_API_BASE_URL`, `QA_*`, `OPENAI_*`
   and `AI_GATEWAY_API_KEY`. Check the AI Gateway key still has budget (AI
   Gateway → Budgets & Spend), or give production its own key. Leave out
   `KYRON_OAUTH_CLIENT_ID` and `APP_BASE_URL`: the site uses its Vercel
   production address and serves its own Kyron client file at
   `/oauth/kyron-client.json`. (Set `APP_BASE_URL` only for a custom domain.)
   **Blob:** do not copy `BLOB_STORE_ID` by hand. Connect the Blob store to
   the project for Production (Storage → the store → Connect Project), then
   check that `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` both appear under
   Environment Variables; add the key from the store's settings if it is
   missing. Without them every upload is refused.
3. **Database:** give production its own empty database (a new Neon branch
   with no data, or a new database); a copy of the development data would let
   the production Cron resume test runs and spend the AI budget. Migrate it
   with every file, in a fresh PowerShell window, then close that window so
   the address cannot leak into a later `npm run dev`:
   `$env:DATABASE_URL='<production database url>'; npm run db:migrate`
   (a value already set wins over `.env.local`). The `1xx` command above only
   works on a database that already has migrations `001`–`023`. Later, run new
   migrations before pushing the deploy that needs them.
4. **Scheduler:** `vercel.json` adds the Cron job; Vercel sends `CRON_SECRET`.
   Each tick drives QA runs for up to 45 s, so a run nobody has open moves on
   every few seconds while it has work, and waits 30 s after a failed step.
5. **Kyron:** after the first deploy, open the site at its **production
   address** (the Kyron page shows the redirect address it uses), sign in with
   the admin code, open **Kyron**, choose **Connect Kyron** and approve. Started
   from a preview or deployment URL the sign-in cannot finish. That is the
   only Kyron step: staff never sign in to Kyron, and every QA run uses this
   one connection. Each Kyron client ID keeps its own sign-in, so local
   development and the site do not overwrite each other.

Vercel Deployment Protection must not block `/oauth/kyron-client.json` (Kyron
reads it during sign-in) or `/api/qa/driver` (the Cron job). Model calls stop
with "API key budget exceeded" when the AI Gateway key reaches its budget; raise
it in Vercel under **AI Gateway → Budgets & Spend**.

Known gaps:

- Uploading a video for a QA run's narration check is turned off on the
  deployed site: Vercel refuses request bodies over 4.5 MB and keeps no files
  (`QA_DATA_DIR` is local disk). Kyron renders are not affected: they are
  checked through their captions and never stored.
- Batch course-setup generation runs from the open batch page, one file per
  request; reopening the page continues the rest.
- A QA step that Vercel stops at its 300-second limit counts as a failure:
  it is tried once more (a render check up to six times), then the run stops
  or the check is marked not tested.

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
- `/kyron`: admin Kyron MCP connection, course content and QA revisions (`/kyron/content`), and the tool catalog (`/kyron/tools`)
- `/drafts`: workspace management and status filters
- `/drafts/new`: start a draft from one prompt box and its files; sending it
  opens the plan, which is drafted automatically
- `/drafts/[id]`: generate, edit, submit, and monitor a draft
- `/sources`: upload and manage reusable source files
- `/batches`: create and manage one workspace per selected source file
- `/design-preview`: static fake-data UI reference; it is not a real workflow

## Known limitations

- DOCX, PDF, and PPTX files up to 50 MB can be analyzed for AI course setup
  generation. Scanned PDFs require OCR and are not supported yet.
- Batch generation runs from the open batch page, one workspace per request,
  rather than a durable background workflow; the limit is 20 workspaces per
  batch.
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
