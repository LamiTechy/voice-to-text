import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PROVIDER_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "DATABASE_NOT_CONFIGURED"
  | "DATABASE_ERROR"
  | "CONFIG_ERROR"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

interface ErrorPayload {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function jsonError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse<ErrorPayload> {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

const DATABASE_ERROR_RE =
  /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|socket hang up|NeonDbError|PostgresError|could not connect|connection (refused|terminated)|DATABASE_URL/i;

/** True when a thrown value looks like an unreachable/misconfigured database. */
export function isDatabaseConnectivityError(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  if (!(error instanceof Error)) return false;
  if (DATABASE_ERROR_RE.test(error.name) || DATABASE_ERROR_RE.test(error.message)) return true;
  const cause = error.cause;
  if (cause instanceof Error && DATABASE_ERROR_RE.test(cause.message)) return true;
  if (cause instanceof Error && cause.name === "TypeError" && /fetch/i.test(cause.message)) {
    return true;
  }
  return false;
}

function messageFor(error: unknown): { code: ApiErrorCode; message: string; status: number } {
  if (isApiError(error)) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message ?? "Invalid input",
      status: 422,
    };
  }
  if (isDatabaseConnectivityError(error)) {
    return {
      code: "DATABASE_ERROR",
      message:
        "Could not reach the database. Check DATABASE_URL and make sure the Postgres instance is reachable, then try again.",
      status: 503,
    };
  }
  return { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", status: 500 };
}

/** Converts any thrown value into a JSON error response without leaking internals. */
export function errorResponse(error: unknown): NextResponse<ErrorPayload> {
  const { code, message, status } = messageFor(error);
  if (isApiError(error) && error.details) {
    return jsonError(code, message, status, error.details);
  }
  if (process.env.NODE_ENV !== "production" && status === 500) {
    const detail = error instanceof Error ? error.message : String(error);
    return jsonError(code, `${message} (${detail})`, status);
  }
  return jsonError(code, message, status);
}
