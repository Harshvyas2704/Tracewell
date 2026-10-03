import type { DbEffect } from "../db/effects";
import type { QueryStats, Row, TableDef, Value } from "../db/types";
import type { Rng } from "./rng";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// What the client sends. The engine parses the body itself, so an invalid
// body can fail at the parsing stage.
export type SimRequest = {
  id: string;
  method: HttpMethod;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string | null; // raw body text
  startAt: number; // virtual ms, for concurrent runs
};

export type SimResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export type Stage =
  | "network"
  | "middleware"
  | "router"
  | "validation"
  | "auth"
  | "controller"
  | "db"
  | "pool"
  | "lock"
  | "eventloop"
  | "response"
  | "error";

export type EventStatus = "ok" | "fail" | "skip" | "wait";

export type SqlInfo = QueryStats & {
  text: string;
  params: Value[];
};

export type SimEvent = {
  seq: number; // global order
  requestId: string;
  stage: Stage;
  type: string; // e.g. "SQL_QUERY", "VALIDATION_FAILED", "LOCK_WAIT"
  label: string; // short human text for the trace
  startTime: number; // virtual ms
  duration: number; // virtual ms
  line?: number; // display code line
  status: EventStatus;
  snapshot?: unknown; // request data at this moment (raw, parsed, validated, ...)
  sql?: SqlInfo;
  groupKey?: string; // used to collapse repeated events (N+1)
};

// One entry per request that ended with a status of 400 or above.
export type SimError = {
  status: number;
  code: string;
  message: string;
  requestId: string;
  eventSeq: number; // the event where it went wrong
};

// Derived from events only.
export type Metrics = {
  totalTime: number; // virtual ms from the first event start to the last event end
  sqlQueries: number;
  rowsScanned: number;
  rowsReturned: number;
};

// The rows of every table at the end of the run.
export type WorldSnapshot = {
  tables: Record<string, Row[]>;
};

export type SimulationResult = {
  requests: SimRequest[];
  responses: Record<string, SimResponse>;
  events: SimEvent[];
  metrics: Metrics;
  errors: SimError[];
  worldAfter: WorldSnapshot;
  seed: number;
};

export type DelayEffect = {
  kind: "delay";
  ms: number;
  label: string;
  line?: number;
};

export type LogEffect = {
  kind: "log";
  label: string;
  line?: number;
};

// Records one event at any stage. The pipeline and middlewares use it.
export type TraceEffect = {
  kind: "trace";
  stage: Stage;
  type: string;
  label: string;
  status?: EventStatus; // defaults to "ok"
  code?: string; // error code when status is "fail", defaults to type
  ms?: number; // virtual time this step takes, defaults to 0
  snapshot?: unknown;
  line?: number;
  groupKey?: string;
};

export type Effect = DelayEffect | LogEffect | TraceEffect | DbEffect;

export type Fixes = Record<string, boolean>;

export type AuthUser = { userId: number; role: string };

// The request as handlers see it, like Express's req.
export type HttpRequest = {
  id: string;
  method: HttpMethod;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>; // names are lowercased
  rawBody: string | null;
  body: unknown; // parsed JSON, replaced by the validated DTO after validation
  user?: AuthUser; // set by the auth middleware
};

// A response plus the display code line that sent it.
export type HandlerResult = SimResponse & { line?: number };

export type ResponseMeta = { line?: number };

export type ResponseBuilder = {
  status(code: number): { json(body: unknown, meta?: ResponseMeta): HandlerResult };
  json(body: unknown, meta?: ResponseMeta): HandlerResult; // status 200
};

export type HandlerContext = {
  req: HttpRequest;
  res: ResponseBuilder;
  fixes: Fixes;
  rng: Rng;
};

// Handlers yield effects. The engine runs each effect and resumes the
// generator with its result. Returning nothing means an empty 200 response.
//
// TypeScript cannot type what each individual yield resumes with, so the
// resume type is any. Annotate the result: const rows: Row[] = yield db.select(...)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandlerGenerator = Generator<Effect, HandlerResult | void, any>;

export type Handler = (ctx: HandlerContext) => HandlerGenerator;

// A middleware that returns a response ends the request early. Returning
// nothing passes the request on, like calling next().
export type Middleware = Handler;

export type Route = {
  method: HttpMethod;
  path: string; // pattern with params, e.g. "/products/:id"
  middlewares?: Middleware[];
  handler: Handler;
  line?: number; // display code line of the route definition
};

export type PresetRequest = {
  method: HttpMethod;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string | null;
};

export type Preset = {
  id: string;
  label: string;
  description?: string;
  request: PresetRequest;
};

// A switch the user can flip to change how the handlers behave, usually to
// fix the bug the scenario shows. Handlers read it as ctx.fixes[id].
export type Fix = {
  id: string;
  label: string;
  description: string;
};

export type Scenario = {
  id: string;
  name: string;
  description?: string;
  world?: TableDef[]; // tables and seed rows
  routes: Route[];
  // Display code, shown to the user and never executed. A function when the
  // code changes with the fixes that are on.
  code?: string | ((fixes: Fixes) => string);
  lines?: { bodyParser?: number; errorHandler?: number }; // display code lines
  presets?: Preset[];
  fixes?: Fix[];
};

export type SimulationInput = {
  scenario: Scenario;
  requests: SimRequest[];
  fixes?: Fixes;
  seed?: number;
};
