import type { HttpMethod, Route } from "../core/types";

export type RouteMatch =
  | { type: "found"; route: Route; params: Record<string, string> }
  | { type: "wrong-method"; allowed: HttpMethod[] } // the path exists, the method does not
  | { type: "not-found" };

const segments = (path: string) => path.split("/").filter(Boolean);

// Returns the params when the pattern matches the path, e.g.
// "/products/:id" and "/products/42" give { id: "42" }.
export function matchPath(
  pattern: string,
  path: string,
): Record<string, string> | undefined {
  const want = segments(pattern);
  const got = segments(path);
  if (want.length !== got.length) return undefined;

  const params: Record<string, string> = {};
  for (const [i, part] of want.entries()) {
    const value = got[i] as string;
    if (part.startsWith(":")) {
      params[part.slice(1)] = safeDecode(value);
    } else if (part !== value) {
      return undefined;
    }
  }
  return params;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// The first route that matches wins, like Express.
export function matchRoute(routes: Route[], method: HttpMethod, path: string): RouteMatch {
  const allowed: HttpMethod[] = [];
  for (const route of routes) {
    const params = matchPath(route.path, path);
    if (!params) continue;
    if (route.method === method) return { type: "found", route, params };
    if (!allowed.includes(route.method)) allowed.push(route.method);
  }
  return allowed.length > 0 ? { type: "wrong-method", allowed } : { type: "not-found" };
}
