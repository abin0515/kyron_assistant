export class SourceTextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceTextValidationError";
  }
}
