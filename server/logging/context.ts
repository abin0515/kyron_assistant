import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export type LogContext = {
  actorId?: string | null;
  actorRole?: string | null;
  qaRunId?: string | null;
  workspaceId?: string | null;
};

const storage = new AsyncLocalStorage<LogContext>();

// Everything logged inside `task` (including model calls made deep inside QA
// evaluators) is tagged with this context.
export function runWithLogContext<T>(context: LogContext, task: () => Promise<T>): Promise<T> {
  return storage.run({ ...storage.getStore(), ...context }, task);
}

export function currentLogContext(): LogContext {
  return storage.getStore() ?? {};
}
