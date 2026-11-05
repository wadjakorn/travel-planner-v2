// Typed domain error for service functions. Lets both server actions and
// (later) the REST API map a failure to the right surface — actions rethrow
// as-is (message preserved), the API maps `code` to an HTTP status.

export type ServiceErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'internal';

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    // Optional machine-readable extras merged into the API error body, e.g.
    // { reason: 'day_order_unsupported' } or { details: { updatedAt } }.
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
