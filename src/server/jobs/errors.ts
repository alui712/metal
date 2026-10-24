/** A failure that retrying can't fix (e.g. a corrupt file). The job fails immediately. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}
