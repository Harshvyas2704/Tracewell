import { isDbError } from "../db/errors";
import { executeQuery } from "../db/execute";
import { toSql } from "../db/sql";
import type { Database } from "../db/types";
import type { Clock } from "./clock";
import { ENGINE_CONFIG } from "./config";
import type { Recorder } from "./recorder";
import type {
  Effect,
  Handler,
  HandlerContext,
  SimError,
  SimResponse,
} from "./types";

export type RunOutcome = {
  response: SimResponse;
  error?: SimError;
};

type RunArgs = {
  handler: Handler;
  ctx: HandlerContext;
  clock: Clock;
  recorder: Recorder;
  database: Database;
};

// What the generator is resumed with: a value, or an error thrown at the yield.
type EffectResult = { value: unknown } | { error: Error };

const EMPTY_OK: SimResponse = { status: 200, headers: {}, body: null };

// Drives one handler to completion: runs each yielded effect, records its
// event, advances the clock, and resumes the generator with the result.
export function runHandler(args: RunArgs): RunOutcome {
  const { handler, ctx, clock, recorder } = args;
  const requestId = ctx.req.id;

  const fail = (type: string, message: string, code = type): RunOutcome => {
    const event = recorder.record({
      requestId,
      stage: "error",
      type,
      label: message,
      startTime: clock.now(),
      duration: 0,
      status: "fail",
    });
    return {
      response: {
        status: 500,
        headers: {},
        body: { error: "Internal Server Error" },
      },
      error: { status: 500, code, message, requestId, eventSeq: event.seq },
    };
  };

  try {
    const gen = handler(ctx);
    let steps = 0;
    let step = gen.next();
    while (!step.done) {
      if (steps >= ENGINE_CONFIG.maxSteps) {
        return fail(
          "ENGINE_STEP_LIMIT",
          `Simulation stopped after ${ENGINE_CONFIG.maxSteps} steps`,
        );
      }
      steps += 1;
      const problem = effectProblem(step.value);
      if (problem) {
        return fail("ENGINE_INVALID_EFFECT", problem);
      }
      const result = runEffect(step.value, args);
      step = "error" in result ? gen.throw(result.error) : gen.next(result.value);
    }
    return { response: step.value ?? EMPTY_OK };
  } catch (err) {
    if (isDbError(err)) {
      return fail("UNHANDLED_DB_ERROR", err.message, err.code);
    }
    return fail("HANDLER_ERROR", err instanceof Error ? err.message : String(err));
  }
}

function effectProblem(effect: Effect): string | undefined {
  const kind = (effect as { kind?: unknown } | null | undefined)?.kind;
  if (kind === "log" || kind === "db") return undefined;
  if (kind === "delay") {
    const { ms } = effect as { ms: unknown };
    return typeof ms === "number" && Number.isFinite(ms) && ms >= 0
      ? undefined
      : `delay effect has invalid duration: ${String(ms)}`;
  }
  return `Handler yielded an unknown effect: ${String(kind)}`;
}

function runEffect(effect: Effect, args: RunArgs): EffectResult {
  const { ctx, clock, recorder, database } = args;
  const requestId = ctx.req.id;
  const line = effect.line !== undefined && { line: effect.line };
  switch (effect.kind) {
    case "delay":
      recorder.record({
        requestId,
        stage: "controller",
        type: "DELAY",
        label: effect.label,
        startTime: clock.now(),
        duration: effect.ms,
        status: "ok",
        ...line,
      });
      clock.advance(effect.ms);
      return { value: undefined };
    case "log":
      recorder.record({
        requestId,
        stage: "controller",
        type: "LOG",
        label: effect.label,
        startTime: clock.now(),
        duration: 0,
        status: "ok",
        ...line,
      });
      return { value: undefined };
    case "db": {
      const { query } = effect;
      const result = executeQuery(database, query);
      const { error } = result;
      recorder.record({
        requestId,
        stage: "db",
        type: "SQL_QUERY",
        label: effect.label ?? `${query.type.toUpperCase()} ${query.table}`,
        startTime: clock.now(),
        duration: result.duration,
        status: error ? "fail" : "ok",
        ...line,
        ...(error && {
          snapshot: {
            error: { code: error.code, message: error.message, detail: error.detail },
          },
        }),
        sql: { ...toSql(query), ...result.stats },
      });
      clock.advance(result.duration);
      return error ? { error } : { value: result.rows };
    }
  }
}
