// Raised when the content changed since it was read, for example a Kyron
// edit rejected because the lesson's lock version moved on. The fix is
// escalated instead of being retried over someone else's change.
export class ContentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentConflictError";
  }
}
