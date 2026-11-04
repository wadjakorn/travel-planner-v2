import { ServiceError } from '@/lib/services/service-error';

// Re-tag a nested ServiceError with positional context (e.g. which day/place)
// so the caller gets a precise 400 message. Non-ServiceErrors propagate as-is.
// Kept in its own module so input parsers can share it without import cycles.
export function withContext<T>(prefix: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ServiceError) {
      throw new ServiceError('bad_request', `${prefix}: ${e.message}`);
    }
    throw e;
  }
}
