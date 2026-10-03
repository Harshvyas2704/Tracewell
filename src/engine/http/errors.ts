import { isDbError } from "../db/errors";

// Thrown by handlers and middlewares to end the request with a status.
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = `HTTP_${status}`) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export type ErrorResponse = {
  status: number;
  code: string;
  message: string;
  body: unknown;
};

// The error handler: maps anything thrown during a request to a response.
export function toErrorResponse(err: unknown): ErrorResponse {
  if (err instanceof HttpError) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      body: { error: err.message },
    };
  }
  if (isDbError(err) && err.code === "23505") {
    return {
      status: 409,
      code: err.code,
      message: err.message,
      body: { error: "Resource already exists", detail: err.detail },
    };
  }
  // Unknown errors never leak their message to the client.
  return {
    status: 500,
    code: isDbError(err) ? err.code : "INTERNAL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    body: { error: "Internal Server Error" },
  };
}
