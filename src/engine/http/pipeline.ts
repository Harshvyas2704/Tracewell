import { withFixes } from "../core/code";
import { COST_CONFIG } from "../core/config";
import { trace } from "../core/effects";
import type { Rng } from "../core/rng";
import type {
  Effect,
  Fixes,
  HandlerContext,
  HandlerResult,
  Scenario,
  SimRequest,
  SimResponse,
} from "../core/types";
import { toErrorResponse } from "./errors";
import { responseBuilder, statusLabel } from "./response";
import { matchRoute } from "./router";

type PipelineArgs = {
  scenario: Scenario;
  req: SimRequest;
  fixes: Fixes;
  rng: Rng;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Steps<T> = Generator<Effect, T, any>;

const res = responseBuilder;

const jsonKb = (value: unknown) => (JSON.stringify(value) ?? "").length / 1024;

// One request, from the socket to the response, as a single generator. The
// middlewares and the handler run inside it, so the runner (and later the
// scheduler) only ever drives one generator per request.
export function* requestPipeline(args: PipelineArgs): Steps<SimResponse> {
  const { req } = args;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    headers[name.toLowerCase()] = value;
  }

  yield trace({
    stage: "network",
    type: "REQUEST_RECEIVED",
    label: `${req.method} ${req.path}`,
    ms: COST_CONFIG.requestMs,
    snapshot: { method: req.method, path: req.path, query: req.query, headers, rawBody: req.body },
  });

  const { line, ...response } = yield* respond(args, headers);

  yield trace({
    stage: "response",
    type: "RESPONSE_SENT",
    label: statusLabel(response.status),
    status: response.status >= 400 ? "fail" : "ok",
    ms: COST_CONFIG.responseMs + jsonKb(response.body) * COST_CONFIG.perJsonKbMs,
    snapshot: response,
    line,
  });
  return response;
}

function* respond(args: PipelineArgs, headers: Record<string, string>): Steps<HandlerResult> {
  const { scenario, req, fixes, rng } = args;
  const routes = withFixes(scenario.routes, fixes);
  const lines = withFixes(scenario.lines, fixes);

  // express.json(): only reads bodies sent as application/json.
  const bodyLine = lines?.bodyParser;
  const parse = { stage: "middleware", line: bodyLine } as const;
  let body: unknown = undefined;
  if (req.body === null || req.body === "") {
    yield trace({ ...parse, type: "BODY_PARSE_SKIPPED", label: "No request body", status: "skip" });
  } else if (!(headers["content-type"] ?? "").includes("application/json")) {
    yield trace({
      ...parse,
      type: "BODY_PARSE_SKIPPED",
      label: "Body ignored: Content-Type is not application/json",
      status: "skip",
    });
  } else {
    const ms = COST_CONFIG.bodyParseMs + (req.body.length / 1024) * COST_CONFIG.perJsonKbMs;
    try {
      body = JSON.parse(req.body);
    } catch {
      // The parser's own message differs between JS engines, so use a fixed one.
      const message = "Request body is not valid JSON";
      yield trace({
        ...parse,
        type: "BODY_PARSE_FAILED",
        label: message,
        status: "fail",
        ms,
        snapshot: { raw: req.body },
      });
      return res.status(400).json({ error: message }, { line: bodyLine });
    }
    yield trace({
      ...parse,
      type: "BODY_PARSED",
      label: "Parsed JSON body",
      ms,
      snapshot: { raw: req.body, parsed: body },
    });
  }

  const match = matchRoute(routes, req.method, req.path);
  const route = { stage: "router", ms: COST_CONFIG.routeMs } as const;
  if (match.type === "not-found") {
    const target = `${req.method} ${req.path}`;
    const hint = match.otherMethods.length > 0 ? ` (${match.otherMethods.join(", ")} exists)` : "";
    yield trace({
      ...route,
      type: "ROUTE_NOT_FOUND",
      label: `No route for ${target}${hint}`,
      status: "fail",
      snapshot: { otherMethods: match.otherMethods },
    });
    // The same body Express sends when nothing handles a request.
    return res.status(404).json({ error: `Cannot ${target}` });
  }
  yield trace({
    ...route,
    type: "ROUTE_MATCHED",
    label: `${match.route.method} ${match.route.path}`,
    snapshot: { params: match.params },
    line: match.route.line,
  });

  const ctx: HandlerContext = {
    req: {
      id: req.id,
      method: req.method,
      path: req.path,
      params: match.params,
      query: req.query,
      headers,
      rawBody: req.body,
      body,
    },
    res,
    fixes,
    rng,
  };

  try {
    for (const middleware of match.route.middlewares ?? []) {
      const early = yield* middleware(ctx);
      if (early) return early;
    }
    return (yield* match.route.handler(ctx)) ?? { status: 200, headers: {}, body: null };
  } catch (err) {
    // The error handler, like app.use((err, req, res, next) => ...).
    const line = lines?.errorHandler;
    const error = toErrorResponse(err);
    yield trace({
      stage: "error",
      type: "ERROR_HANDLED",
      label: error.message,
      status: "fail",
      code: error.code,
      cause: err,
      snapshot: { error: { code: error.code, message: error.message }, status: error.status },
      line,
    });
    return res.status(error.status).json(error.body, { line });
  }
}
