import { randomUUID } from "node:crypto";

import type {
  ContentVersionFilter,
  NewContentVersion,
  QaRubricApproval,
  StoredQaRun,
} from "@/server/qa/types";
import type { QaContentVersionDetail, QaLesson, QaLessonSnapshot, QaRunTarget } from "@/types/api";

// Mirrors server/qa/repository.ts without a database, for pipeline tests.
export function createInMemoryQaRepository() {
  const lessons = new Map<string, QaLesson>();
  const snapshots = new Map<string, QaLessonSnapshot>();
  const runs = new Map<string, StoredQaRun>();
  const approvals = new Map<string, QaRubricApproval>();
  const media = new Map<string, Uint8Array>();
  const versions: QaContentVersionDetail[] = [];
  const clone = <T>(value: T): T => structuredClone(value);

  async function updateRun(
    id: string,
    mutate: (run: StoredQaRun) => StoredQaRun | null | Promise<StoredQaRun | null>,
  ) {
    const current = runs.get(id);

    if (!current) {
      return null;
    }

    const next = await mutate(clone(current));

    if (!next) {
      return null;
    }

    const updated = { ...next, updatedAt: new Date().toISOString() };
    runs.set(id, clone(updated));

    return updated;
  }

  return {
    reset() {
      lessons.clear();
      snapshots.clear();
      runs.clear();
      approvals.clear();
      media.clear();
      versions.length = 0;
    },
    async saveLesson(lesson: QaLesson) {
      lessons.set(lesson.id, clone(lesson));
      return lesson;
    },
    async getLesson(id: string) {
      return lessons.has(id) ? clone(lessons.get(id)!) : null;
    },
    async findLessonByWorkspace(workspaceId: string) {
      return clone([...lessons.values()].find((lesson) => lesson.workspaceId === workspaceId) ?? null);
    },
    async listLessons(ownerId?: string) {
      return clone([...lessons.values()].filter((lesson) => !ownerId || lesson.ownerId === ownerId));
    },
    async updateLesson(id: string, mutate: (lesson: QaLesson) => QaLesson) {
      const lesson = lessons.get(id);

      if (!lesson) {
        return null;
      }

      const next = mutate(clone(lesson));
      lessons.set(id, clone(next));

      return next;
    },
    async saveSnapshot(snapshot: QaLessonSnapshot) {
      snapshots.set(snapshot.id, clone(snapshot));
      return snapshot;
    },
    async getSnapshot(id: string) {
      return snapshots.has(id) ? clone(snapshots.get(id)!) : null;
    },
    async saveRun(run: StoredQaRun) {
      runs.set(run.id, clone(run));
      return run;
    },
    async getRun(id: string) {
      return runs.has(id) ? clone(runs.get(id)!) : null;
    },
    async listRuns({ ownerId, target, workspaceId }: { ownerId?: string; target?: QaRunTarget; workspaceId?: string } = {}) {
      return clone(
        [...runs.values()]
          .filter((run) => (!ownerId || run.ownerId === ownerId) && (!target || run.target === target) && (!workspaceId || run.workspaceId === workspaceId))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      );
    },
    async getLatestWorkspaceRun(workspaceId: string, target: QaRunTarget) {
      const matching = [...runs.values()]
        .filter((run) => run.workspaceId === workspaceId && run.target === target);

      return clone(matching.at(-1) ?? null);
    },
    async listRunIdsWithPendingWork(limit: number) {
      return [...runs.values()]
        .filter((run) => run.pendingSteps.length > 0 && (!run.lease || run.lease.expiresAt <= Date.now()))
        .slice(0, limit)
        .map((run) => run.id);
    },
    updateRun,
    async claimRun(id: string) {
      const run = runs.get(id);

      if (!run || run.pendingSteps.length === 0 || (run.lease && run.lease.expiresAt > Date.now())) {
        return null;
      }

      const leaseToken = randomUUID();
      const claimed = { ...run, lease: { token: leaseToken, expiresAt: Date.now() + 300_000 } };
      runs.set(id, clone(claimed));

      return { run: clone(claimed), leaseToken };
    },
    async releaseRun(id: string, leaseToken: string, mutate: (run: StoredQaRun) => StoredQaRun) {
      return updateRun(id, (run) => (run.lease?.token === leaseToken ? { ...mutate(run), lease: null } : null));
    },
    async getRubricApproval(domain: string, version: string) {
      return approvals.get(`${domain}-${version}`) ?? null;
    },
    async saveRubricApproval(approval: QaRubricApproval) {
      approvals.set(`${approval.domain}-${approval.version}`, approval);
      return approval;
    },
    async insertContentVersion(version: NewContentVersion) {
      const numbers = versions
        .filter((candidate) => candidate.lessonId === version.lessonId && candidate.target === version.target)
        .map((candidate) => candidate.versionNumber);
      const saved: QaContentVersionDetail = {
        ...clone(version),
        id: randomUUID(),
        lessonTitle: lessons.get(version.lessonId)?.title ?? "Untitled draft",
        versionNumber: Math.max(0, ...numbers) + 1,
        createdAt: new Date().toISOString(),
      };

      versions.push(saved);

      return clone(saved);
    },
    async getLatestAppliedVersion(lessonId: string, target: QaRunTarget) {
      const applied = versions.filter(
        (version) => version.lessonId === lessonId && version.target === target && version.status === "applied",
      );

      return clone(applied.at(-1) ?? null);
    },
    async getContentVersion(id: string) {
      return clone(versions.find((version) => version.id === id) ?? null);
    },
    async listContentVersions({ lessonId, target }: ContentVersionFilter, page: { page: number; pageSize: number }) {
      const matching = versions
        .filter((version) => (!lessonId || version.lessonId === lessonId) && (!target || version.target === target))
        .reverse();
      const start = (page.page - 1) * page.pageSize;

      return {
        items: clone(matching.slice(start, start + page.pageSize)).map((version) => {
          const listed: Partial<QaContentVersionDetail> = { ...version };

          delete listed.content;

          return listed;
        }),
        totalCount: matching.length,
      };
    },
    async saveMediaFile(runId: string, fileName: string, bytes: Uint8Array) {
      const key = `${runId}/${fileName}`;
      media.set(key, bytes);
      return key;
    },
    async readMediaFile(filePath: string) {
      return Buffer.from(media.get(filePath) ?? new Uint8Array());
    },
  };
}
