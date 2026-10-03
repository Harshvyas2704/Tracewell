import {
  createRequest,
  type HttpMethod,
  type PresetRequest,
  type SimRequest,
} from "../../engine";

// The request as the user is editing it. Query and headers are ordered lists
// so half-typed rows (an empty name, a repeated name) can exist while editing.
export type Pair = { id: number; key: string; value: string };

export type Draft = {
  method: HttpMethod;
  path: string;
  query: Pair[];
  headers: Pair[];
  body: string;
};

export const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

let nextPairId = 1;

export function newPair(key = "", value = ""): Pair {
  return { id: nextPairId++, key, value };
}

const toPairs = (record: Record<string, string> = {}) =>
  Object.entries(record).map(([key, value]) => newPair(key, value));

// Rows without a name are ignored. A repeated name keeps the last value.
function toRecord(pairs: Pair[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const { key, value } of pairs) {
    if (key.trim() !== "") record[key.trim()] = value;
  }
  return record;
}

export function draftFromPreset(request: PresetRequest): Draft {
  return {
    method: request.method,
    path: request.path,
    query: toPairs(request.query),
    headers: toPairs(request.headers),
    body: request.body ?? "",
  };
}

export const emptyDraft = (): Draft => draftFromPreset({ method: "GET", path: "/" });

export function draftToRequest(draft: Draft): SimRequest {
  return createRequest({
    method: draft.method,
    path: draft.path.trim() || "/",
    query: toRecord(draft.query),
    headers: toRecord(draft.headers),
    body: draft.body.trim() === "" ? null : draft.body,
  });
}

// A hint shown while editing. The request can still be sent: the simulated
// server then rejects it at the body parsing stage.
export function jsonProblem(body: string): string | undefined {
  if (body.trim() === "") return undefined;
  try {
    JSON.parse(body);
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid JSON";
  }
}
