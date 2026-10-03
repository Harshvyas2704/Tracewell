import type { PresetRequest, SimRequest } from "../core/types";

// Builds a full request from the parts a user or preset provides. A query
// string typed into the path is moved into the query map.
export function createRequest(
  parts: PresetRequest & { id?: string; startAt?: number },
): SimRequest {
  const [path = "/", search = ""] = parts.path.split("?", 2);
  const query: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(search)) query[key] = value;

  return {
    id: parts.id ?? "r1",
    method: parts.method,
    path,
    query: { ...query, ...parts.query },
    headers: { ...parts.headers },
    body: parts.body ?? null,
    startAt: parts.startAt ?? 0,
  };
}
