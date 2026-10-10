import type { QueryCost } from "../db/cost";
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
  cost: QueryCost; // where the event's duration comes from
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
  handled?: boolean; // a failed event whose error the handler caught and recovered from
};

// One entry per request that ended with a status of 400 or above. It points
// at the cause of that status:
//   1. the failed event whose error reached the error handler, if there is one;
//   2. otherwise the last failed event the handler did not recover from
//      (auth, validation, body parsing, routing, a thrown error);
//   3. otherwise the RESPONSE_SENT event, for a status the handler chose itself.
export type SimError = {
  status: number;
  code: string; // from the event in rule 1 or 2, or from the status in rule 3
  message: string;
  requestId: string;
  eventSeq: number;
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
  cause?: unknown; // the thrown error this event is handling, set by the error handler
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

// A part of a scenario that may change with the fixes that are on. Read it
// with withFixes(value, fixes).
export type PerFixes<T> = T | ((fixes: Fixes) => T);

export type Scenario = {
  id: string;
  name: string;
  description?: string;
  // Short paragraphs explaining what the scenario shows and why. Plain text;
  // `backticks` mark inline code.
  why?: string[];
  world?: PerFixes<TableDef[]>; // tables and seed rows
  routes: PerFixes<Route[]>;
  code?: PerFixes<string>; // display code, shown to the user and never executed
  lines?: PerFixes<{ bodyParser?: number; errorHandler?: number }>; // display code lines
  presets?: Preset[];
  fixes?: Fix[];
};

export type SimulationInput = {
  scenario: Scenario;
  requests: SimRequest[];
  fixes?: Fixes;
  seed?: number;
};
