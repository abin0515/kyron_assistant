// Raised when the content changed since it was read, for example a Kyron
// edit rejected because the lesson's lock version moved on. The fix is
// escalated instead of being retried over someone else's change.
export class ContentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentConflictError";
  }
}

// Raised by a render request that failed before the request itself was sent
// (signing in, connecting, reading the lesson): nothing was rendered, so it
// may be retried without paying twice.
export class RenderNotSentError extends Error {
  readonly original: unknown;

  constructor(original: unknown) {
    super(original instanceof Error ? original.message : "The render request could not be sent.");
    this.name = "RenderNotSentError";
    this.original = original;
  }
}
