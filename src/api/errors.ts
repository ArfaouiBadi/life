/** Error shape shared by the mock and HTTP adapters (mirrors Spring's status + message). */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
