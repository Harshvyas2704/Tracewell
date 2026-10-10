import type { HandlerResult, ResponseBuilder, ResponseMeta } from "../core/types";

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

export function statusLabel(status: number): string {
  const text = STATUS_TEXT[status];
  return text ? `${status} ${text}` : String(status);
}

// A code for a status the handler chose itself, e.g. 404 gives "NOT_FOUND".
export function statusCode(status: number): string {
  const text = STATUS_TEXT[status];
  return text ? text.toUpperCase().replace(/[^A-Z0-9]+/g, "_") : `HTTP_${status}`;
}

function json(status: number, body: unknown, meta: ResponseMeta = {}): HandlerResult {
  return {
    status,
    headers: { "content-type": "application/json" },
    body,
    ...(meta.line !== undefined && { line: meta.line }),
  };
}

// Like Express's res, but it only builds the response. The pipeline sends it
// when the handler returns it.
export const responseBuilder: ResponseBuilder = {
  status: (code) => ({ json: (body, meta) => json(code, body, meta) }),
  json: (body, meta) => json(200, body, meta),
};
