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
             ──► re-check ──► awaiting approval: the owner reviews the template and the module report
             ──► approved ──► render video in Kyron (QA_KYRON_VIDEO) ──► narration check from captions
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
3. Each change is decided with the policy (`decideRepair`): every proposed
   change is applied automatically where the content can be written, critical
   findings, answer keys and lesson settings included (since Nov 4, 2026). Only
   `propose_only` holds changes back. A change a person accepted from an
   escalation is applied exactly as approved.
4. Applied changes are written with a read before and after each field; a
   concurrent edit stops the round and escalates. The content is then re-read,
   saved as a new version, checked by the independent verifier, and the
   affected checks re-run. A change the verifier rejects is undone and the
   finding goes back to the revision agent with the verifier's reason. At most
   two rounds per finding; a finding still failing after that escalates.
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
cross-field consistency, length against the chosen level, and — once a video
is available — narration vs. transcript. Tutor behavior and visuals are
recorded as human checks.

The structural rule "No placeholder or nonsense text" (since Nov 11, 2026)
treats test or nonsense text as a major finding, so QA rewrites it like any
other fix. It catches template text (TODO, lorem ipsum, [insert …], {{…}}),
stock test strings ("test", "asdf", "sample text"), spoken narration with no
words, and fields where at least half the words are letter runs ("abcdef",
"cdefgab"), keyboard runs ("asdf", "qwerty") or one letter repeated ("aaaa").
Quoted text and capitalised labels such as ABCD are left alone. Kyron lessons
are checked scene by scene, so the finding names the scene. The audience-fit
review also rates nonsense the rule cannot catch (made-up words, off-topic
filler) as major.

### Length targets (since Nov 11, 2026)

Planning picks one length level per module; QA checks each asset against it
(`lib/length-targets.ts`, the length check in `server/qa/evaluators/length.ts`):

| Content | Brief | Normal | Detailed |
|---|---|---|---|
| Video (one per topic) | 1 min | 5 min | 15 min |
| Activity | 3 min | 8 min | 20 min |
| Practice / quiz | 5 min | 10 min | 30 min |

The level is stored as the Kyron lesson length it maps to: Brief 480 s, Normal
900 s, Detailed 1800 s (3600 s also reads as Detailed). The mapping is
calibrated on a generated draft: a 900-second Kyron lesson produced a
4.9-minute topic video, which is Normal. A topic is a Kyron section; its video
is its introduction, lectures and conclusion played back to back, and its
practice activities form its quiz. Before rendering, lengths are estimated from
narration at 150 words per minute, plus 2 minutes per learner turn for a
conversation (one turn per question-bank item, 3 when Kyron gives none) and
1 minute per multiple-choice question. A length closer to another level's
target than to the chosen one is a minor finding with a "needs review" check,
flagged for a person; QA never changes lengths and they never block. Setup QA
likewise reports on the chosen level but never changes it.

## Production jobs

Table `production_jobs`, one per course, created when the course setup is first
checked (single drafts and batches alike). Each scheduler tick recomputes the
stage from the durable records and logs every change (`production.stage`):

| Stage | Meaning |
|---|---|
| Course setup | Setup generated, checked and fixed; waiting for the Kyron draft |
| Kyron generating | The draft exists; Kyron is generating |
| Lesson QA | Reading, checking, revising and verifying the lesson |
| Awaiting approval | QA is done; the owner reviews the template and approves it to render video |
| Video | Rendering in Kyron and checking the narration |
| Needs review | What a person must do is listed (escalations, human checks, video) |
| Ready | Script, video and human checks passed; publishing stays manual |
| Blocked | Kyron failed, configuration missing, or the course budget is spent |

Kyron's draft status also turns "error" (or "started") during later video
renders. Once QA has checked the template from Kyron, the course counts as
generated (Kyron's message is kept as "Template generated. Kyron reports: …"),
and a failed render QA requested shows on the lesson run ("The render failed;
run QA again and approve a new render"), not as a failed generation.

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
  `objective`) are marked as high-impact on each change and applied
  automatically like other fixes (since Nov 4, 2026).
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

When QA has finished its own checks and fixes on a generated Kyron lesson, the
run waits in **Awaiting approval** (`QaRun.renderApproval`): the workspace owner
opens `/drafts/[id]/review`, reads the template (grouped by topic) and the
module report, and approves it (`POST /api/qa/runs/[id]/approve-render`). Flagged
or escalated items do not hide the approval; they are listed for the reviewer.
The approval is refused if the lesson changed in Kyron since QA checked it (QA
then checks it again). Only then does the run ask Kyron to render the lesson,
check the render status every 30 s, and compare Kyron's captions with the
approved script. The render is still running while `validate_lesson` lists a
missing video for an activity that has not failed; it failed when a narrated
video part (or its activity) reports `"error"`, and the failure names those
videos plus Kyron's own reason when its draft status gives one. A finished
result counts only once the render was seen in progress (or after 10 checks),
because right after the request Kyron can still show the previous render. A
video already in error before the request (read just before it, saved with
the request marker) counts as failed again only after it was seen rendering.
Once everything else is over, a new failure is reported at once (with that
video); otherwise the run waits on the old error for 5 minutes after other
videos were seen rendering, or 20 minutes if none were, then reports that
Kyron still shows an error for it. A check that fails is tried again 30 s
later: up to 6 times for a Kyron timeout or busy server (including its sign-in
service), once for anything else, then the run says the video check could not
finish. An error before the render request is sent (reading the run or the
budget) is retried and never counted as a render; a refusal before Kyron took
the request (not connected, rendering off) stops the run and clears the
request marker. While `validate_lesson` is clear, a full check reads every
activity in full on the first check and after three light checks in a row
(about every 2 minutes). A light check reads in full only activities whose list
status is neither "ok" nor empty, videos still showing an old error, and videos
the last check saw rendering: on Nov 12, 2026 the re-render cost 11 Kyron calls
per check, and a light check costs 5. Before a light check's "done" or
"failed" counts, it reads the activities it skipped and decides again. A video
that shows rendering or failing only on its own part, while its activity's
list status says "ok" or has none, is found at the next full check. A render
that brief (under 2 minutes) can go unseen, so it does not restart the
old-error wait. While a render check waits, an open page asks for the run when
the check is due (`nextStepInMs`) instead of every 1.5 s.
A failed render is never retried on its own: the review page offers
**Run QA again**, which needs a new approval. Since Nov 11, 2026 (the first
live render missed a failed Introduction video). If they differ, the agent may adjust the
scene narration and the lesson is rendered once more; a second mismatch is
escalated. One approval covers at most two renders; "Run again" starts a new
run that needs a new approval. Only the workspace owner or the admin can
approve, only the latest check of the lesson, and only while no video is
attached. A failed render request is never retried, and a request interrupted
after Kyron accepted it is not sent again, so one failure cannot pay for two
renders. Approval is refused while the run's token budget or the course budget
is spent, because the video could not be checked afterwards. With
`QA_KYRON_VIDEO=off` the approval is recorded and nothing is rendered; once
rendering is on, the owner approves again to render. A fix applied after a
render makes the narration check stale, so the run cannot reach Verified until
the video is checked again.

The module report shows, per module: the topic and learning objective of each
asset, each topic's video length and its category, what QA found and fixed
(before and after), items flagged for human review and why, and a preview link
per asset (the draft's Kyron preview plus a link to the asset on the review
page). Activity and practice lengths are checked but not shown.

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
| 5 | `QA_AUTONOMY_POLICY=auto`: every proposed fix applies automatically, critical findings and answer keys included; each is read back, verified independently and re-checked; at most two attempts. Writes stay limited by `QA_KYRON_WRITES`. | QA runs without a person in the loop (decided Nov 4, 2026); a person sees only findings that two attempts could not fix. |
| 5a | One revision agent (`gpt-6-luna`) resolves all open findings per round; the server validates and applies its changes. | Related changes stay consistent, and corrections use a pinned model. |
| 5b | Every content state is saved as a numbered version with before/after per field. | A full audit trail of what the agents changed and why. |
| 6 | Missing evidence is NOT_TESTED, never PASS; a run with untested required checks ends **Incomplete**. | A green summary must not hide gaps. |
| 7 | Video generation starts only after QA finishes and the owner approves the template; at most one re-render per approval; a failed render request is not retried; publishing is not built. | Cost control; the user reviews the template before credits are spent (Nov 11, 2026); `AGENTS.md`. |
| 7a | One durable production job per course, advanced by one scheduler; a server-side poller replaces the open-page dependency. | Courses move without anyone watching a page. |
| 7b | An independent verifier reviews every applied fix and can undo it. | The agent that wrote a fix does not grade it. |
| 7c | Kyron writes are controlled by `QA_KYRON_WRITES`: "[QA Test]" drafts only while the harness was validated; `all` since Nov 9, 2026. | Safe testing first, then QA fixes every draft. |
| 8 | OpenAI `gpt-6-luna`, medium effort (high for the verifier), strict JSON, `store: false`, token budget per run. With `AI_GATEWAY_API_KEY` the same calls go through Vercel AI Gateway as `openai/gpt-6-luna`, pinned to OpenAI; transcription stays on `OPENAI_API_KEY`. | Configured and tested; one key for deployment on Vercel. |
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
| Awaiting approval | QA finished; the template waits for the owner's review and approval before any video is rendered. |
| Passed | Automated checks passed. For lessons, video narration and human checks are still needed. |
| Verified | Lesson script, video narration and human checks all passed. |
| Changes proposed | Blocking findings remain, with proposed changes to apply in Kyron Studio. |
| Needs decision | Escalated findings wait for the admin. |
| Incomplete | No blocking findings, but a required check could not run (for example, no sources). |
| Blocked | Cannot continue: waiting for Kyron MCP, missing configuration, or the token budget. |

## Configuration

`AUTH_MODE`, `ACCESS_CODE_ADMIN`, `ACCESS_CODE_DEVELOPER`, `SESSION_SECRET`,
`DATABASE_URL`, `AI_GATEWAY_API_KEY` (optional), `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_QA_MODEL` (optional),
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
