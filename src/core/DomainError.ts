export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 403,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
