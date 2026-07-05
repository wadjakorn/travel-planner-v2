// JSON response helpers for the REST API. Error bodies follow a single
// contract — `{ error, message }` — and map a ServiceError code to the
// right HTTP status. Ticket API-B builds on this for the domain routes.

import { NextResponse } from 'next/server';
import { ServiceError, type ServiceErrorCode } from '@/lib/services/service-error';

const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
};

export function apiJson<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(
  code: ServiceErrorCode,
  message: string,
): NextResponse {
  return NextResponse.json(
    { error: code, message },
    { status: STATUS_BY_CODE[code] },
  );
}

// Map any thrown value to the error contract. A ServiceError keeps its
// code/message; anything else becomes an opaque 500 (no internals leaked).
export function apiErrorFrom(err: unknown): NextResponse {
  if (err instanceof ServiceError) {
    return apiError(err.code, err.message);
  }
  return NextResponse.json(
    { error: 'internal', message: 'Internal server error' },
    { status: 500 },
  );
}
