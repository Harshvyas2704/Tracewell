import type { DbEffect } from "../db/effects";
import type { QueryStats, Row, TableDef, Value } from "../db/types";
import type { Rng } from "./rng";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type SimRequest = {
  id: string;
  method: HttpMethod;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown; // parsed JSON, or raw string if parsing failed
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

export type SimError = {
  status: number;
  code: string;
  message: string;
  requestId: string;
  eventSeq: number;
};

export type Metrics = {
  totalTime: number; // virtual ms from the first event start to the last event end
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

export type Effect = DelayEffect | LogEffect | DbEffect;

export type Fixes = Record<string, boolean>;

export type HandlerContext = {
  req: SimRequest;
  fixes: Fixes;
  rng: Rng;
};

// Handlers yield effects. The engine runs each effect and resumes the
// generator with its result. Returning nothing means an empty 200 response.
//
// TypeScript cannot type what each individual yield resumes with, so the
// resume type is any. Annotate the result: const rows: Row[] = yield db.select(...)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandlerGenerator = Generator<Effect, SimResponse | void, any>;

export type Handler = (ctx: HandlerContext) => HandlerGenerator;

// Scenarios have a single handler for now. Routes and display code arrive in
// later phases.
export type Scenario = {
  id: string;
  name: string;
  world?: TableDef[]; // tables and seed rows
  handler: Handler;
};

export type SimulationInput = {
  scenario: Scenario;
  requests: SimRequest[];
  fixes?: Fixes;
  seed?: number;
};
