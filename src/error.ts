export class InternalError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}
