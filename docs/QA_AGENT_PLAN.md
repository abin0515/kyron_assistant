# Kyron Course QA Agent

Status as of November 2, 2026. Source proposal:
`Kyron_QA_Agent_Implementation_Plan.docx` (October 20, 2026).

## Goal

Fully automate course video generation. Quality checks run **inside the
generation runtime**, not as a separate tool: every course setup is checked and
fixed before Kyron builds it, and every generated lesson is checked once Kyron
finishes. People handle escalated exceptions and a small random audit.

**Pilot scope:** Stevens CPE courses created by this launcher (rubric domain
`cpe`). A second rubric pack for high-school AI lessons (`hs-ai`) exists for the
M1/M2 material.

## How QA runs in the generation runtime

```text
Production job created (one per course) ── advanced by the scheduler (worker tick)
Generate course setup ──► setup check (inline) ──► revision agent: safe fixes written to the workspace
                                                   └► critical/unfixable → proposed version, escalated
Create course draft ──► submit gate: setup check current and passing? ──► Kyron draft (public API)
Server-side poller ──► Kyron reports "done" ──► generated-lesson check starts automatically
Lesson check ──► read through Kyron MCP (scenes, conversations, vocabulary)
             ──► checks ──► revision agent writes safe fixes scene by scene (lock version, read back)
             ──► independent verifier: a fix that adds an error is reverted and escalated
             ──► re-check ──► render video in Kyron (QA_KYRON_VIDEO) ──► narration check from captions
             ──► mismatch: fix narration and re-render once ──► review: escalations, human checks, publish (manual)
```

Every state of the content along the way (as read, as revised, as proposed) is
recorded as a numbered **content version**; see below.

- **After generation.** `generateCurrentUserWorkspaceCourseSetup` and batch
  generation run the setup check in the same request (up to 120 s; 60 s per
  batch workspace). The editor receives the already-fixed setup.
- **Before Kyron.** `submitCurrentUserDraftWorkspace` calls
  `assertSetupReadyForSubmission`. A stale or missing check re-runs inline.
  Changes proposed, escalated, blocked or failed checks stop submission unless
  the user chooses **Submit anyway**, which is recorded on the run and in the
  logs.
- **After Kyron.** The worker's server-side poller (every generating draft,
  every owner, at most every 30 s) starts the lesson check when a draft becomes
  `done`; a page that polls does the same.
- **Scheduler.** `npm run qa:worker` calls `/api/qa/driver` (later Vercel
  Cron). Each tick polls generating drafts, advances QA runs and updates every
  production job. Runs waiting on a render keep a timed lease so the worker
  does not spin.

### What the setup check covers

| Criterion | Checks |
|---|---|
| Setup matches the source | Description and objective describe what the sources teach, nothing invented. |
| Objective is measurable | One specific objective with an observable verb, achievable in the duration. |
| Audience is grounded | Matches the source; no invented employer, credential or prerequisite. |
| Duration and type fit | Duration fits the material; lesson/practice/scenario fits the content. |
| Title is clear | Specific and accurate. |

References are the workspace's own inputs: the pasted source text plus the
extracted text of every linked Source Library file. Proposed values are
validated (lengths, allowed durations and types) before they are written.

## Revision agent

`server/qa/revision-agent.ts`. One `revise` step per round replaces the earlier
one-fix-per-finding repair:

1. All open blocking findings go to the revision model (`OPENAI_REVISION_MODEL`,
   default `gpt-6-luna`, medium effort, strict JSON, `store: false`) together
   with the content, the source references, the checker's suggested values as
   hints, and the list of fields it may edit. One call returns one coherent set
   of field changes, so related fields stay consistent.
2. The server validates every change: only fields a finding names (for lessons
   also the other text fields of the same activity; answer keys only when a
   finding is about the answer key), existing activities, one change per field,
   allowed setup values and lengths, answer keys naming existing options.
3. Each change is decided with the existing policy (`decideRepair`): applied
   automatically unless it is critical, changes an answer key, or the policy is
   `propose_only`. A change a person accepted is applied exactly as approved.
4. Applied changes are written with a read before and after each field; a
   concurrent edit stops the round and escalates. The content is then re-read,
   saved as a new version, and the affected checks re-run. At most two rounds per
   finding.
5. Changes that cannot be applied (pasted content, or ones needing approval) are
   saved as a **proposed** version, downloadable in the paste format.

Model calls are logged under purpose `qa.revision` with tokens and cost.

## Content versions

Table `qa_content_versions`, numbered per lesson and target (course setup or
generated lesson). Each version stores its status (`applied`: the content is in
this state; `proposed`: a revision not applied), author, model, QA run, source
(`workspace_setup`, `kyron_mcp`, `manual`), a hash of the lesson and activities,
a summary, the full content, and each changed field with before, after, reason
and the findings it resolves.

| When | Version | Author |
|---|---|---|
| A run reads content that differs from the latest version | applied | Workspace course setup, Edited in the workspace, Kyron generation, Changed in Kyron outside the QA agent, or Pasted by &lt;user&gt; |
| The revision agent writes and reads back changes | applied | QA revision agent (with model) |
| The revision agent's changes cannot be applied | proposed | QA revision agent (with model) |

Each version also writes a `qa.content.version` log event. Versions appear on
each run page, under **Logs → Content versions** (with CSV/JSON export), and
`GET /api/qa/content-versions/{id}?download=1` returns a version in the paste
format. Log purge does not delete versions.

### What the generated-lesson check covers

Structural rules, source fidelity (claims vs. workspace references), assessment
(questions solved with the key hidden), objective coverage and audience fit,
cross-field consistency, and — once a video is available — narration vs.
transcript. Tutor behavior and visuals are recorded as human checks.

## Production jobs

Table `production_jobs`, one per course, created when the course setup is first
checked (single drafts and batches alike). Each scheduler tick recomputes the
stage from the durable records and logs every change (`production.stage`):

| Stage | Meaning |
|---|---|
| Course setup | Setup generated, checked and fixed; waiting for the Kyron draft |
| Kyron generating | The draft exists; Kyron is generating |
| Lesson QA | Reading, checking, revising and verifying the lesson |
| Video | Rendering in Kyron and checking the narration |
| Needs review | What a person must do is listed (escalations, human checks, video) |
| Ready | Script, video and human checks passed; publishing stays manual |
| Blocked | Kyron failed, configuration missing, or the course budget is spent |

`QA_COURSE_BUDGET_USD` (default $1) caps model spend per course: once reached,
model steps stop and the job shows **Blocked**. The **QA agent → Production**
tab lists every job with its stage, what is needed, links and cost.

## Kyron MCP read and write

Connected with permission `read write` (client file served as JSON, see the
README). The app is the only caller; models never get tools.

- **Read** (`server/qa/kyron-lesson.ts`): collection → draft lesson → sections →
  activities → scenes, plus vocabulary. Lecture narration and on-screen text
  are the joined scene text for the checks; each scene's narration, title and
  on-screen text is its own field (`scenes.<id>.narration`, …). Conversations
  map to open questions (question and model answer) with their misconceptions
  as tutor guidance. Vocabulary is checked as a "Vocabulary" activity.
- **Write**: only `update_lesson_activity`, `update_lesson`,
  `update_lesson_section`, `update_vocabulary_item` and (for video)
  `regenerate_all_lesson_videos`. Every edit carries the lesson's
  `lock_version`; a refusal becomes a conflict and escalates. Scene narration
  keeps the lecture script in step. Never sent: scene or vocabulary deletion,
  `generate_scenes`, theme or avatar changes, publishing.
- **Protected**: answer keys and lesson settings (`lesson.title`, `audience`,
  `objective`) always need a person's approval; accepted ones are then written.
- **Switches**: `QA_KYRON_WRITES` (`test-only` by default: drafts named
  "[QA Test] …"; `all`; `off`) and `QA_KYRON_VIDEO` (`off` by default; renders
  use Kyron credits). Without write permission or outside the switch, fixes are
  saved as proposed versions.

## Independent verifier

After the revision agent writes changes, `server/qa/verifier.ts` reviews each
one in a fresh call with different instructions and high reasoning effort
(purpose `qa.verify`): resolves, partial, does not resolve, or introduces an
error. A change that introduces an error is written back to its previous value,
saved as a version by "QA verifier", and its findings are escalated.

## Video and narration loop

When the script passes and video is allowed, the run asks Kyron to render the
lesson, checks the render status every 30 s (`validate_lesson`), then compares
Kyron's captions with the approved script. If they differ, the agent may adjust
the scene narration and the lesson is rendered once more; a second mismatch is
escalated.

## Defect library

Table `qa_defects`; **QA agent → Defects**. Reviewers log what QA missed, false
alarms, wrong fixes, harness bugs, Kyron output errors and source problems.
Findings a reviewer rejects and audits that find a defect are added
automatically. CSV/JSON export feeds the testing sets.

## Key facts

- **The public Kyron API has no lesson content.** Reading and editing generated
  lessons requires Kyron MCP.
- **Kyron MCP** (`https://www.kyronlearning.com/mcp`): OAuth 2.1 with PKCE and
  refresh tokens, no service account, apps identified by a public client
  metadata file (CIMD), scopes `read`/`write`/`claudeai`. Its tool list is
  visible only after sign-in.

## Decisions

| # | Decision | Reason |
|---|---|---|
| 1 | TypeScript inside this Next.js app. | Project stack; reuses Neon, OpenAI, source extraction and polling. |
| 2 | QA runs inline in generation and submission, with a time budget; leftovers continue in the worker or an open page. | QA is part of the runtime and cannot depend on an open browser. |
| 3 | Our server is the only Kyron MCP caller. Models never receive tools; repairs are structured patches the server validates. | Untrusted content must not steer writes. |
| 4 | Every write is re-read before and after; a concurrent edit escalates. | Never overwrite a person's change. |
| 5 | `QA_AUTONOMY_POLICY=auto`: confirmed non-critical fixes apply automatically; answer keys and critical findings escalate; at most two attempts. | Minimal human involvement without silent high-risk changes. |
| 5a | One revision agent (`gpt-6-luna`) resolves all open findings per round; the server validates and applies its changes. | Related changes stay consistent, and corrections use a pinned model. |
| 5b | Every content state is saved as a numbered version with before/after per field. | A full audit trail of what the agents changed and why. |
| 6 | Missing evidence is NOT_TESTED, never PASS; a run with untested required checks ends **Incomplete**. | A green summary must not hide gaps. |
| 7 | Video generation starts only after the lesson check passes; at most one re-render; publishing is not built. | Cost control; `AGENTS.md`. |
| 7a | One durable production job per course, advanced by one scheduler; a server-side poller replaces the open-page dependency. | Courses move without anyone watching a page. |
| 7b | An independent verifier reviews every applied fix and can undo it. | The agent that wrote a fix does not grade it. |
| 7c | Kyron writes are limited to "[QA Test]" drafts until the harness is validated (`QA_KYRON_WRITES`). | Safe testing on the shared Kyron account. |
| 8 | OpenAI `gpt-6-luna`, medium effort, strict JSON, `store: false`, token budget per run. | Configured and tested. |
| 9 | Admins and developers see QA across the team; other users see their own. | Review needs one shared queue. |

## Storage (Neon)

Migrations `100`–`125` (one statement per file, numbered from 100 so they cannot
collide with other branches):

- `qa_lessons`, `qa_snapshots`, `qa_runs`, `qa_rubric_approvals` — documents in
  JSONB with indexed columns. Runs use a version column for optimistic updates
  and lease columns for atomic claims.
- `qa_content_versions` — numbered content versions with field-level changes.
- `production_jobs` — one per course, with stage, needs, cost and events.
- `qa_defects` — the defect library.
- `app_log_events`, `llm_usage_events`, `model_pricing` — the log system, with
  `gpt-6-luna` and `gpt-4o-transcribe` prices seeded from OpenAI's pricing page.

Apply only these files with the one-off command in the README when the database
is shared: `npm run db:migrate` re-runs every migration, and `023` rewrites batch
rows each time. Uploaded videos for narration checks stay on local disk under
`.data/qa/media`.

## Log system

- **Writer:** `logEvent()` and `recordLlmUsage()` are best effort and scrub
  secrets (keys, tokens, cookies, codes, connection strings, signed-URL
  parameters). An `AsyncLocalStorage` context tags model calls made inside a QA
  step with that run and workspace.
- **Logged:** every OpenAI call (tokens, cached and reasoning tokens, latency,
  status, estimated cost at the price in effect), Kyron API requests, Kyron MCP
  connection and tool calls, sign-ins, QA steps, content versions, overrides,
  draft creation and unexpected errors.
- **Viewer (`/logs`, admin and developer):** totals for 24 hours / 7 / 30 days,
  breakdown by model and purpose, filterable events with details, model usage
  linked to QA runs, content versions with before/after, CSV/JSON export, and
  prices. The admin can add a price
  (effective immediately, never rewriting past costs) and purge old logs after
  confirmation.

## Roles

| Capability | admin | developer |
|---|---|---|
| Drafts, sources, batches, QA on own workspaces | ✓ | ✓ |
| QA overview across the team, logs, export | ✓ | ✓ |
| Kyron connection, rubric approval, escalation decisions, audits, human checks | ✓ | — |
| Model prices, log purge | ✓ | — |

## Status

| Area | Status |
|---|---|
| Access-code sign-in, roles, localhost guard | Done |
| Kyron MCP sign-in and tool explorer | Connected (read; write after reconnect) |
| Kyron lesson read, scene-level write, video render and captions | Done; writes limited to "[QA Test]" drafts, video off by default |
| QA in the generation runtime (setup check, submit gate, lesson check trigger) | Done |
| Generated-lesson checks, revision agent, independent verifier, narration loop | Done |
| Production jobs, scheduler and server-side poller | Done |
| Defect library | Done |
| Content-version log (`qa_content_versions`, Logs tab, run panel, download) | Done |
| Neon storage for QA | Done |
| Log system and `/logs` | Done |
| Rubric tuning | Waits for known defects from colleagues |

## Pasting a generated lesson (without Kyron MCP)

On the workspace page, **Quality checks → Generated lesson → Paste generated
lesson content**. The workspace sources are added as references automatically.

```json
{
  "lesson": {
    "title": "…",
    "audience": "…",
    "learningObjectives": ["…"],
    "durationSeconds": 900,
    "assetType": "lesson"
  },
  "activities": [
    {
      "id": "intro",
      "type": "instruction | question | conversation | scenario | reflection | other",
      "title": "…",
      "narration": "…",
      "onScreenText": "…",
      "question": {
        "prompt": "…",
        "options": [{ "id": "A", "text": "…" }],
        "answerKey": ["B"],
        "rationale": "…"
      },
      "tutorGuidance": "…"
    }
  ]
}
```

Only `lesson.title` and one activity are required; missing content is reported
as NOT_TESTED.

## Run outcomes

| Stage | Meaning |
|---|---|
| Passed | Automated checks passed. For lessons, video narration and human checks are still needed. |
| Verified | Lesson script, video narration and human checks all passed. |
| Changes proposed | Blocking findings remain, with proposed changes to apply in Kyron Studio. |
| Needs decision | Escalated findings wait for the admin. |
| Incomplete | No blocking findings, but a required check could not run (for example, no sources). |
| Blocked | Cannot continue: waiting for Kyron MCP, missing configuration, or the token budget. |

## Configuration

`AUTH_MODE`, `ACCESS_CODE_ADMIN`, `ACCESS_CODE_DEVELOPER`, `SESSION_SECRET`,
`DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_QA_MODEL` (optional),
`OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_REVISION_MODEL`, `QA_AUTONOMY_POLICY`, `QA_RUN_TOKEN_BUDGET`,
`QA_AUDIT_RATE`, `QA_KYRON_WRITES`, `QA_KYRON_VIDEO`, `QA_COURSE_BUDGET_USD`,
`QA_VIDEO_POLL_MS` (tests), `CRON_SECRET`, `KYRON_MCP_URL`, `KYRON_OAUTH_CLIENT_ID`,
`APP_BASE_URL`, `TOKEN_ENCRYPTION_KEY`, `KYRON_MCP_READ_TOOLS`, `QA_DATA_DIR`
(media only).

## Verification

`npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. The
pipeline tests run against an in-memory copy of the QA store and cover the
setup fix loop, the submit gate, escalation of critical setup problems, waiting
for Kyron MCP, pasted-lesson proposals, writable fixes, concurrent edits, the
token budget, the content versions each of these records, scene-level Kyron
fixes, verifier reverts, the render and re-render loop and the course budget.
The Kyron tests use a fixture read from draft 14826 and cover mapping, update
building, lock versions, conflicts and the write switches; production tests
cover every stage.
