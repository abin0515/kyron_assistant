import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writes: [] as Array<{ name: string; args: Record<string, unknown> }>,
  writeError: null as Error | null,
  writeAccess: true,
  // Kyron's publish check, and render state laid over the fixture activities.
  validation: [] as unknown[],
  render: {} as Record<string, { status?: string; videos?: Record<string, string | null> }>,
  // Kyron's REST draft status.
  restStatus: { status: "done", status_message: "" },
  restReads: 0,
  reads: [] as string[],
  // The activities read in full, in order.
  activityReads: [] as number[],
  // A read tool that fails, with this error.
  failRead: null as { name: string; error: Error } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/drafts/workspaces/repository", () => ({
  getDraftWorkspaceById: vi.fn(),
  updateDraftWorkspace: vi.fn(),
}));
vi.mock("@/server/kyron/client", () => ({
  getKyronLessonCollection: async () => {
    mocks.restReads += 1;

    return mocks.restStatus;
  },
}));
vi.mock("@/server/kyron-mcp/service", async () => {
  const fixture = (await import("./fixtures/kyron-lesson-23930.json")).default as Record<string, unknown> & {
    activities: Record<string, Record<string, unknown>>;
    activityList: Array<{ id: number }>;
  };
  const withRender = (activity: Record<string, unknown>) => {
    const render = mocks.render[String(activity.id)];

    if (!render) {
      return activity;
    }

    const copy: Record<string, unknown> = { ...activity, ...(render.status ? { status: render.status } : {}) };

    for (const [part, status] of Object.entries(render.videos ?? {})) {
      copy[part] = { ...(activity[part] as Record<string, unknown>), video_status: status };
    }

    return copy;
  };
  const read = async (name: string, args: Record<string, unknown>) => {
    mocks.reads.push(name);

    if (name === "get_lesson_activity") {
      mocks.activityReads.push(Number(args.id));
    }

    if (mocks.failRead?.name === name) {
      throw mocks.failRead.error;
    }

    switch (name) {
      case "get_lesson_collection":
        return fixture.collection;
      case "get_lesson":
        return fixture.lesson;
      case "list_lesson_sections":
        return fixture.sections;
      case "list_lesson_activities":
        return fixture.activityList
          .filter((item) => String(item.id) in fixture.activities)
          .map((item) => ({ ...item, ...(mocks.render[String(item.id)]?.status ? { status: mocks.render[String(item.id)].status } : {}) }));
      case "get_lesson_activity":
        return withRender(fixture.activities[String(args.id)]);
      case "validate_lesson":
        return mocks.validation;
      case "list_vocabulary_items":
        return fixture.vocabulary;
      case "get_lesson_lock_version":
        return { lock_version: 7 };
      default:
        throw new Error(`Unexpected read ${name}`);
    }
  };
  const write = async (name: string, args: Record<string, unknown>) => {
    if (mocks.writeError) {
      throw mocks.writeError;
    }

    mocks.writes.push({ name, args });

    return {};
  };

  return {
    withKyronReader: async (run: (reader: typeof read) => unknown) => run(read),
    withKyronWriter: async (run: (session: { read: typeof read; write: typeof write }) => unknown) => run({ read, write }),
    hasKyronWriteAccess: async () => mocks.writeAccess,
  };
});

import { KyronMcpError } from "@/server/kyron-mcp/errors";
import { ContentConflictError, RenderNotSentError } from "@/server/qa/content-errors";
import { resolveContentSource } from "@/server/qa/content-sources";
import { evaluateAssessment } from "@/server/qa/evaluators/assessment";
import {
  buildActivityUpdate,
  captionText,
  mapKyronLesson,
  parseActivity,
  readKyronLessonData,
  readKyronRenderStatus,
  requestKyronRender,
  writeKyronField,
} from "@/server/qa/kyron-lesson";
import { buildSnapshot } from "@/server/qa/snapshot";
import type { QaLesson, QaRubricPack } from "@/types/api";

import fixture from "./fixtures/kyron-lesson-23930.json";

beforeEach(() => {
  mocks.writes.length = 0;
  mocks.writeError = null;
  mocks.writeAccess = true;
  mocks.validation = [];
  mocks.render = {};
  mocks.restStatus = { status: "done", status_message: "" };
  mocks.restReads = 0;
  mocks.reads = [];
  mocks.activityReads = [];
  mocks.failRead = null;
});

afterEach(() => {
  delete process.env.QA_KYRON_WRITES;
  delete process.env.QA_KYRON_VIDEO;
});

describe("reading a Kyron lesson", () => {
  it("maps the lesson, scenes, conversations and vocabulary into the QA snapshot", async () => {
    const packet = mapKyronLesson(await readKyronLessonData(14826));
    const [intro, lecture, conversation, vocabulary] = packet.activities;

    expect(packet.lesson).toMatchObject({
      title: "[QA Test] Introduction to PDEs - MIT 18.152 Class 1",
      durationSeconds: 900,
      learningObjectives: ["Given representative partial differential equations, classify each equation by its order and linearity."],
    });
    expect(packet.activities.map((activity) => activity.type)).toEqual(["instruction", "instruction", "conversation", "other"]);
    expect(intro.id).toBe("504101");
    expect(lecture.narration).toMatch(/^Now shift from order to the other classification feature/);
    expect(lecture.scenes).toHaveLength(4);
    expect(lecture.scenes?.[0]).toMatchObject({ part: "lecture_video", title: "Linearity vs Order" });
    expect(lecture.readOnlyFields).toEqual(["narration", "onScreenText"]);
    expect(conversation.question).toMatchObject({ options: [], answerKey: [] });
    expect(conversation.question?.prompt).toContain("still linear");
    expect(conversation.question?.rationale).toContain("linear");
    expect(conversation.tutorGuidance).toContain("Misconceptions to address");
    expect(vocabulary.terms?.some((term) => term.term.includes("black"))).toBe(true);
    expect(JSON.stringify(packet)).not.toMatch(/https?:\/\/|<p>/);
  });

  it("treats a lesson without multiple-choice questions as not applicable for assessment", async () => {
    const packet = mapKyronLesson(await readKyronLessonData(14826));
    const snapshot = buildSnapshot({ createdBy: "t", lessonId: "l", packet: { ...packet, references: [] }, source: "kyron_mcp" });
    const output = await evaluateAssessment({ snapshot, rubric: {} as QaRubricPack, activityIds: null });

    expect(output.checks.map((check) => check.status)).toEqual(["not_applicable", "not_applicable"]);
    expect(output.usage).toEqual([]);
  });
});

describe("writing to Kyron", () => {
  const lecture = parseActivity(fixture.activities["504105"]);
  const conversation = parseActivity(fixture.activities["504106"]);
  const firstScene = lecture.scenes[0];

  it("writes scene narration as stored HTML and keeps the lecture script in step", () => {
    const update = buildActivityUpdate(lecture, `scenes.${firstScene.id}.narration`, "Linearity is the second feature.");

    expect(update.lecture_video).toEqual({
      scenes: [{ id: Number(firstScene.id), scene_narration: "<p>Linearity is the second feature.</p>" }],
    });
    expect(update.content).toContain("Linearity is the second feature.");
    expect(update.content).not.toContain(firstScene.narration);
    expect(update).not.toHaveProperty("generate_video");
  });

  it("keeps bullet formatting for on-screen text and maps conversation fields", () => {
    const bulleted = lecture.scenes.find((scene) => /<li[\s>]/.test(scene.rawText));

    if (bulleted) {
      const update = buildActivityUpdate(lecture, `scenes.${bulleted.id}.onScreenText`, "- First point\n- Second point");

      expect(JSON.stringify(update)).toContain("<ul><li>First point</li><li>Second point</li></ul>");
    }

    expect(buildActivityUpdate(conversation, "question.prompt", "New question?")).toEqual({ question: "New question?" });
    expect(buildActivityUpdate(conversation, "question.rationale", "New answer.")).toEqual({ answer: "New answer." });
    expect(() => buildActivityUpdate(lecture, "narration", "x")).toThrow(/scene by scene/);
    expect(() => buildActivityUpdate(conversation, "tutorGuidance", "x")).toThrow(/cannot be written/);
  });

  it("sends every edit with the lesson's lock version and turns a refusal into a conflict", async () => {
    await writeKyronField(14826, "504105", `scenes.${firstScene.id}.title`, "Order versus linearity");
    await writeKyronField(14826, "vocabulary", "vocabulary.209582.definition", "Not covered in this lesson.");
    await writeKyronField(14826, "", "lesson.audience", "Engineers new to PDEs");

    expect(mocks.writes.map((write) => write.name)).toEqual([
      "update_lesson_activity",
      "update_vocabulary_item",
      "update_lesson",
    ]);
    expect(mocks.writes[0].args).toMatchObject({ id: 504105, lesson_lock_version: 7 });
    expect(mocks.writes[1].args).toEqual({ id: 209582, definition: "Not covered in this lesson." });
    expect(mocks.writes[2].args).toEqual({ id: 23930, audience: "Engineers new to PDEs", lesson_lock_version: 7 });

    mocks.writeError = new KyronMcpError("KYRON_INVALID_RESPONSE", "Kyron update_lesson_activity failed: 409 Conflict");

    await expect(writeKyronField(14826, "504106", "question.prompt", "x")).rejects.toBeInstanceOf(ContentConflictError);
  });

  it("reads captions as plain text", () => {
    expect(captionText("WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\n<v Marcus>Now shift</v>\n\n2\n00:00:02.000 --> 00:00:04.000\nfrom order.")).toBe(
      "Now shift from order.",
    );
  });
});

describe("reading Kyron's render status", () => {
  // Draft 14826 as Kyron reported it after its first render (Nov 11, 2026):
  // the publish check was clear, the Introduction's video was "error", the
  // other videos "ok", and the conversations' wait videos never rendered.
  const afterFirstRender = () => {
    mocks.validation = [];
    mocks.render = {
      "504101": { status: "error", videos: { lecture_video: "error" } },
      "504105": { status: "ok", videos: { lecture_video: "ok" } },
      "504106": { status: "ok", videos: { question_video: "ok", wait_video: null } },
    };
  };
  const missing = (activityIds: number[], name = "Some videos are missing") => ({ name, activity_ids: activityIds });
  const memory = (staleFailures: number[] = [], sawRendering = false, staleWaits = 0) => ({ staleFailures, sawRendering, staleWaits });
  const renderStatus = async (staleFailures: number[] = []) => (await readKyronRenderStatus(14826, memory(staleFailures))).status;

  it("reports the Introduction as failed even though the publish check is clear", async () => {
    afterFirstRender();

    expect(await renderStatus()).toEqual({
      status: "failed",
      message: 'Kyron could not render the video for "Introduction".',
    });
  });

  it("adds the reason from Kyron's draft status when it names the scene", async () => {
    afterFirstRender();
    mocks.restStatus = { status: "error", status_message: "Could not start avatar video generation for scene 611410" };
    process.env.QA_KYRON_VIDEO = "all";

    const source = await resolveContentSource("kyron_mcp", { title: "[QA Test] PDEs", kyronLessonId: 14826 } as QaLesson);

    expect(await source.getVideoStatus({ title: "[QA Test] PDEs", kyronLessonId: 14826 } as QaLesson, "")).toEqual({
      status: "failed",
      message:
        'Kyron could not render the video for "Introduction". Kyron says: "Could not start avatar video generation for scene 611410".',
      pollState: { staleFailures: [], sawRendering: false, staleWaits: 0, checksSinceFull: 0, renderingIds: [] },
    });
  });

  describe("re-rendering after a failed video", () => {
    it("records the videos already in error just before the request", async () => {
      afterFirstRender();

      const source = await resolveContentSource("kyron_mcp", { title: "[QA Test] PDEs", kyronLessonId: 14826 } as QaLesson);

      expect(await source.readVideoBaseline?.({ title: "[QA Test] PDEs", kyronLessonId: 14826 } as QaLesson)).toEqual({
        staleFailures: ["504101"],
      });
    });

    it("keeps waiting on the old error instead of reporting it as this render's", async () => {
      // The other videos finished; the Introduction still shows the old error.
      afterFirstRender();
      mocks.validation = [missing([504101])];

      expect(await readKyronRenderStatus(14826, memory([504101], true, 3))).toEqual({
        status: { status: "pending", inProgress: false, detail: '"Introduction" still showed the error from before this render.' },
        memory: { ...memory([504101], true, 4), renderingIds: [] },
      });

      // Kyron's own "failed" problem about that same video waits too.
      mocks.validation = [missing([504101], "Some videos failed to render")];

      expect(await renderStatus([504101])).toMatchObject({ status: "pending", inProgress: false });
    });

    it("stops waiting on an old error a while after everything else finished", async () => {
      afterFirstRender();

      // 5 minutes after the other videos were seen rendering, 20 when none were.
      expect(await readKyronRenderStatus(14826, memory([504101], true, 9))).toMatchObject({
        status: { status: "failed", message: 'Kyron still shows an error for "Introduction" after this render.' },
      });
      expect(await readKyronRenderStatus(14826, memory([504101], false, 9))).toMatchObject({ status: { status: "pending" } });
      expect(await readKyronRenderStatus(14826, memory([504101], false, 39))).toMatchObject({ status: { status: "failed" } });
    });

    it("reports a new failure at once, with the video still showing its old error", async () => {
      afterFirstRender();
      mocks.render["504105"] = { videos: { lecture_video: "error" } };

      expect(await renderStatus([504101])).toEqual({
        status: "failed",
        message: 'Kyron could not render the videos for "Introduction" and "Linearity in PDEs".',
      });
    });

    it("counts an error again once the video was seen rendering", async () => {
      afterFirstRender();
      mocks.render["504101"] = { status: "error", videos: { lecture_video: null } };

      // Seen rendering again: no longer an old error.
      expect(await readKyronRenderStatus(14826, memory([504101]))).toMatchObject({
        status: { status: "done" },
        memory: { staleFailures: [] },
      });

      mocks.render["504101"] = { status: "error", videos: { lecture_video: "error" } };

      expect(await renderStatus([])).toMatchObject({ status: "failed" });
    });

    it("drops an old error once Kyron's list shows the video rendering again, then counts a new one", async () => {
      afterFirstRender();
      // Re-render started: Kyron cleared the Introduction's status and lists videos as missing.
      mocks.render["504101"] = { status: "ok", videos: { lecture_video: "error" } };
      mocks.validation = [missing([504101, 504105])];

      const first = await readKyronRenderStatus(14826, memory([504101]));

      expect(first).toEqual({ status: { status: "pending", inProgress: true }, memory: { ...memory([], true, 0), renderingIds: [] } });

      // It fails again: this render's failure, named as such.
      mocks.render["504101"] = { status: "error", videos: { lecture_video: "error" } };
      mocks.validation = [];

      expect((await readKyronRenderStatus(14826, first.memory)).status).toEqual({
        status: "failed",
        message: 'Kyron could not render the video for "Introduction".',
      });
    });

    it("does not wait on an activity in error whose videos are fine", async () => {
      afterFirstRender();
      mocks.render["504101"] = { videos: { lecture_video: "ok" } };
      mocks.render["504106"] = { status: "error", videos: { question_video: "ok", wait_video: null } };

      expect(await renderStatus([504106])).toEqual({ status: "done" });
    });

    it("judges a video by its own status while its activity still says error", async () => {
      afterFirstRender();
      mocks.render["504101"] = { status: "error", videos: { lecture_video: "ok" } };

      expect(await renderStatus()).toEqual({ status: "done" });

      // Rendering again, listed as missing: not a failure.
      mocks.render["504101"] = { status: "error", videos: { lecture_video: null } };
      mocks.validation = [missing([504101])];

      expect(await renderStatus()).toEqual({ status: "pending", inProgress: true });
    });
  });

  it("is still rendering while the publish check lists videos that have not failed", async () => {
    // The previous render's error is still showing on the Introduction.
    afterFirstRender();
    mocks.validation = [missing([504101, 504105]), missing([504106], "Some invisible avatar videos are missing")];

    expect(await renderStatus()).toEqual({ status: "pending", inProgress: true });
    // While rendering, only the activity in error is read in full.
    expect(mocks.reads.filter((name) => name === "get_lesson_activity")).toHaveLength(1);
  });

  it("is done when every narrated video is ready and wait videos were never rendered", async () => {
    mocks.render = {
      "504101": { videos: { lecture_video: "ok" } },
      "504105": { videos: { lecture_video: "ok" } },
      "504106": { videos: { question_video: "ok", wait_video: null } },
    };

    expect(await renderStatus()).toEqual({ status: "done" });
  });

  it("fails instead of waiting an hour when only failed videos are still listed as missing", async () => {
    afterFirstRender();
    mocks.validation = [missing([504101])];

    expect(await renderStatus()).toMatchObject({ status: "failed", message: expect.stringContaining('"Introduction"') });
  });

  it("fails when the publish check itself reports a failed video", async () => {
    mocks.validation = [missing([504105], "Some videos failed to render")];

    expect(await renderStatus()).toEqual({
      status: "failed",
      message: 'Kyron could not render the video for "Linearity in PDEs".',
    });
  });

  it("ignores an error on a wait video, which has no narration and is never rendered", async () => {
    mocks.render = {
      "504101": { videos: { lecture_video: "ok" } },
      "504105": { videos: { lecture_video: "ok" } },
      "504106": { videos: { question_video: "ok", wait_video: "error" } },
    };

    expect(await renderStatus()).toEqual({ status: "done" });
  });

  it("waits on a video status it does not know, and names several failures briefly", async () => {
    mocks.render = { "504105": { videos: { lecture_video: "processing" } } };

    expect(await renderStatus()).toEqual({ status: "pending", inProgress: true });

    mocks.render = {
      "504101": { videos: { lecture_video: "error" } },
      "504105": { videos: { lecture_video: "failed" } },
      "504106": { status: "error", videos: { question_video: "Error" } },
    };

    expect(await renderStatus()).toEqual({
      status: "failed",
      message: 'Kyron could not render the videos for "Introduction", "Linearity in PDEs" and "Why is the equation u_t = a(x)u_{xx} + b(x)u still linear,…".',
    });
  });

  // While the publish check is clear, the checks between full ones read only
  // what needs a look, so a render costs Kyron fewer calls.
  describe("light checks", () => {
    const light = (base: ReturnType<typeof memory>, checksSinceFull = 0, renderingIds: number[] = []) => ({
      ...base,
      checksSinceFull,
      renderingIds,
    });
    const lesson = { title: "[QA Test] PDEs", kyronLessonId: 14826 } as QaLesson;
    const everyActivity = [504101, 504105, 504106];

    it("reads in full only the activity still showing its old error", async () => {
      afterFirstRender();

      expect(await readKyronRenderStatus(14826, light(memory([504101], false, 3)))).toEqual({
        status: { status: "pending", inProgress: false, detail: '"Introduction" still showed the error from before this render.' },
        memory: { staleFailures: [504101], sawRendering: false, staleWaits: 4, checksSinceFull: 1, renderingIds: [] },
      });
      expect(mocks.reads).toEqual([
        "get_lesson_collection",
        "validate_lesson",
        "list_lesson_sections",
        "list_lesson_activities",
        "get_lesson_activity",
      ]);
      expect(mocks.activityReads).toEqual([504101]);
    });

    it("reads every activity in full on the first clear check and after three light ones", async () => {
      afterFirstRender();

      // A new render, or memory from before light checks existed.
      const first = await readKyronRenderStatus(14826, memory([504101]));

      expect(mocks.activityReads).toEqual(everyActivity);
      expect(first.memory).toMatchObject({ checksSinceFull: 0, renderingIds: [] });

      let current = first.memory;

      for (const since of [1, 2, 3]) {
        mocks.activityReads = [];
        current = (await readKyronRenderStatus(14826, current)).memory;

        expect(mocks.activityReads).toEqual([504101]);
        expect(current.checksSinceFull).toBe(since);
      }

      mocks.activityReads = [];

      expect((await readKyronRenderStatus(14826, current)).memory.checksSinceFull).toBe(0);
      expect(mocks.activityReads).toEqual(everyActivity);
    });

    it("keeps an old error whose list status was cleared while its video still shows it", async () => {
      afterFirstRender();
      mocks.render["504101"] = { status: "ok", videos: { lecture_video: "error" } };

      const first = await readKyronRenderStatus(14826, light(memory([504101])), { resultCounts: false });

      expect(mocks.activityReads).toEqual([504101]);
      expect(first).toMatchObject({ status: { status: "pending", inProgress: false }, memory: { staleFailures: [504101] } });
      // The next full check still waits on it instead of calling it this render's failure.
      expect((await readKyronRenderStatus(14826, { ...first.memory, checksSinceFull: 3 })).status).toMatchObject({
        status: "pending",
        inProgress: false,
      });

      // Listed as missing again, it is rendering: dropped, as in a full check.
      mocks.validation = [missing([504101, 504105])];

      expect((await readKyronRenderStatus(14826, light(memory([504101])))).memory.staleFailures).toEqual([]);
    });

    it("confirms a light 'done' by reading the activities it skipped", async () => {
      // A video part failed behind an "ok" list status.
      mocks.render = { "504105": { status: "ok", videos: { lecture_video: "error" } } };

      const failed = await readKyronRenderStatus(14826, light(memory()));

      expect(mocks.activityReads).toEqual(everyActivity);
      expect(failed.status).toEqual({ status: "failed", message: 'Kyron could not render the video for "Linearity in PDEs".' });
      expect(failed.memory.checksSinceFull).toBe(0);

      // A part still rendering behind an "ok" list status keeps it pending,
      // and the next light check watches that activity.
      mocks.render = { "504105": { status: "ok", videos: { lecture_video: "processing" } } };
      mocks.activityReads = [];

      const pending = await readKyronRenderStatus(14826, light(memory()));

      expect(pending).toEqual({
        status: { status: "pending", inProgress: true },
        memory: { staleFailures: [], sawRendering: true, staleWaits: 0, checksSinceFull: 0, renderingIds: [504105] },
      });

      mocks.activityReads = [];
      await readKyronRenderStatus(14826, pending.memory);

      expect(mocks.activityReads).toEqual([504105]);
    });

    it("confirms a light 'failed' the same way", async () => {
      mocks.render = {
        "504101": { status: "error", videos: { lecture_video: "error" } },
        "504106": { status: "ok", videos: { question_video: "error" } },
      };

      expect((await readKyronRenderStatus(14826, light(memory()))).status).toEqual({
        status: "failed",
        message: 'Kyron could not render the videos for "Introduction" and "Why is the equation u_t = a(x)u_{xx} + b(x)u still linear,…".',
      });
      expect(mocks.activityReads).toEqual(everyActivity);
    });

    it("confirms the old-error timeout and counts that wait once", async () => {
      afterFirstRender();

      expect(await readKyronRenderStatus(14826, light(memory([504101], false, 39)))).toEqual({
        status: { status: "failed", message: 'Kyron still shows an error for "Introduction" after this render.' },
        memory: { staleFailures: [504101], sawRendering: false, staleWaits: 40, checksSinceFull: 0, renderingIds: [] },
      });
      expect(mocks.activityReads).toEqual(everyActivity);

      // The confirmation finds another video rendering: keep waiting.
      mocks.render["504105"] = { status: "ok", videos: { lecture_video: "processing" } };

      expect(await readKyronRenderStatus(14826, light(memory([504101], false, 39)))).toEqual({
        status: { status: "pending", inProgress: true },
        memory: { staleFailures: [504101], sawRendering: true, staleWaits: 0, checksSinceFull: 0, renderingIds: [504105] },
      });
    });

    it("leaves a verdict that does not count yet unconfirmed, and skips Kyron's reason for it", async () => {
      expect(await readKyronRenderStatus(14826, light(memory()), { resultCounts: false })).toMatchObject({
        status: { status: "done" },
        memory: { checksSinceFull: 1 },
      });
      expect(mocks.activityReads).toEqual([]);

      mocks.render = { "504105": { status: "error", videos: { lecture_video: "error" } } };
      mocks.restStatus = { status: "error", status_message: "Could not start avatar video generation for scene 611410" };

      const source = await resolveContentSource("kyron_mcp", lesson);
      const pollState = { staleFailures: [], sawRendering: false, staleWaits: 0, checksSinceFull: 0, renderingIds: [] };

      expect(await source.getVideoStatus(lesson, "", pollState, { resultCounts: false })).toEqual({
        status: "failed",
        message: 'Kyron could not render the video for "Linearity in PDEs".',
        pollState: { ...pollState, checksSinceFull: 1 },
      });
      expect(mocks.restReads).toBe(0);
    });

    it("keeps its memory through the Kyron source", async () => {
      afterFirstRender();

      const source = await resolveContentSource("kyron_mcp", lesson);
      const first = await source.getVideoStatus(lesson, "", { staleFailures: ["504101"] });

      expect(first.pollState).toEqual({ staleFailures: ["504101"], sawRendering: false, staleWaits: 1, checksSinceFull: 0, renderingIds: [] });

      mocks.activityReads = [];

      const second = await source.getVideoStatus(lesson, "", first.pollState);

      expect(mocks.activityReads).toEqual([504101]);
      expect(second.pollState).toMatchObject({ staleWaits: 2, checksSinceFull: 1 });
    });

    it("reads everything in full when the stored memory is from before light checks or damaged", async () => {
      afterFirstRender();

      const source = await resolveContentSource("kyron_mcp", lesson);
      const stored = [
        { staleFailures: ["504101"], sawRendering: false, staleWaits: 3 },
        { staleFailures: ["504101"], checksSinceFull: 1 },
        { staleFailures: ["504101"], checksSinceFull: 1, renderingIds: ["x", "0", "-1"] },
        { staleFailures: ["504101"], checksSinceFull: Number.NaN, renderingIds: [] },
        { staleFailures: ["504101"], checksSinceFull: -1, renderingIds: [] },
      ];

      for (const pollState of stored) {
        mocks.activityReads = [];
        await source.getVideoStatus(lesson, "", pollState);

        expect(mocks.activityReads).toEqual(everyActivity);
      }

      // Read directly, an invalid count gives a full check too.
      mocks.activityReads = [];
      await readKyronRenderStatus(14826, light(memory([504101]), Number.NaN));

      expect(mocks.activityReads).toEqual(everyActivity);
    });
  });
});

describe("requesting a Kyron render", () => {
  it("says when the request never reached the render tool, so it can be retried", async () => {
    mocks.failRead = { name: "get_lesson_collection", error: new KyronMcpError("KYRON_MCP_UNAVAILABLE", "Kyron MCP timed out.", true) };

    await expect(requestKyronRender(14826)).rejects.toBeInstanceOf(RenderNotSentError);
    expect(mocks.writes).toEqual([]);
  });

  it("does not claim a failed render call was never sent", async () => {
    mocks.writeError = new KyronMcpError("KYRON_MCP_UNAVAILABLE", "Kyron MCP timed out.", true);

    const request = requestKyronRender(14826);

    await expect(request).rejects.toBeInstanceOf(KyronMcpError);
    await expect(request).rejects.not.toBeInstanceOf(RenderNotSentError);
  });
});

describe("when the harness may change Kyron content", () => {
  const lesson = (title: string) => ({ title, kyronLessonId: 14826 }) as QaLesson;

  it("writes only to test drafts by default, and never without write permission", async () => {
    expect((await resolveContentSource("kyron_mcp", lesson("[QA Test] PDEs"))).writable).toBe(true);
    expect((await resolveContentSource("kyron_mcp", lesson("PDEs for CPE"))).writable).toBe(false);

    mocks.writeAccess = false;

    expect((await resolveContentSource("kyron_mcp", lesson("[QA Test] PDEs"))).writable).toBe(false);
  });

  it("follows the write and video switches", async () => {
    process.env.QA_KYRON_WRITES = "off";
    expect((await resolveContentSource("kyron_mcp", lesson("[QA Test] PDEs"))).writable).toBe(false);

    process.env.QA_KYRON_WRITES = "all";
    expect((await resolveContentSource("kyron_mcp", lesson("PDEs for CPE"))).supportsVideo).toBe(false);

    process.env.QA_KYRON_VIDEO = "test-only";
    expect((await resolveContentSource("kyron_mcp", lesson("[QA Test] PDEs"))).supportsVideo).toBe(true);
    expect((await resolveContentSource("kyron_mcp", lesson("PDEs for CPE"))).supportsVideo).toBe(false);
  });
});
