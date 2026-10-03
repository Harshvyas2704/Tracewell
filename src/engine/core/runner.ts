import { executeQuery } from "../db/execute";
import { toSql } from "../db/sql";
import type { Database } from "../db/types";
import { roundMs, type Clock } from "./clock";
import { ENGINE_CONFIG } from "./config";
import type { Recorder } from "./recorder";
import type { Effect, SimError, SimResponse } from "./types";

export type RunOutcome = {
  response: SimResponse;
  error?: SimError;
};

type RunArgs = {
  requestId: string;
  // The whole request (pipeline, middlewares, handler) as one generator.
  start: () => Generator<Effect, SimResponse, unknown>;
  clock: Clock;
  recorder: Recorder;
  database: Database;
};

// What the generator is resumed with: a value, or an error thrown at the yield.
type EffectResult = { value: unknown } | { error: Error };

// The most recent failed event. It explains an error response.
type Failure = { code: string; message: string; eventSeq: number };

type EffectEnv = RunArgs & { onFailure(failure: Failure): void };

// Drives one request to completion: runs each yielded effect, records its
// event, advances the clock, and resumes the generator with the result.
export function runRequest(args: RunArgs): RunOutcome {
  const { requestId, clock, recorder } = args;
  let failure: Failure | undefined;
  const env: EffectEnv = { ...args, onFailure: (f) => (failure = f) };

  // Stops the simulation itself. No response is sent.
  const abort = (code: string, message: string): RunOutcome => {
    const event = recorder.record({
      requestId,
      stage: "error",
      type: code,
      label: message,
      startTime: clock.now(),
      duration: 0,
      status: "fail",
    });
    return {
      response: { status: 500, headers: {}, body: { error: "Internal Server Error" } },
      error: { status: 500, code, message, requestId, eventSeq: event.seq },
    };
  };

  try {
    const gen = args.start();
    let steps = 0;
    let step = gen.next();
    while (!step.done) {
      if (steps >= ENGINE_CONFIG.maxSteps) {
        return abort(
          "ENGINE_STEP_LIMIT",
          `Simulation stopped after ${ENGINE_CONFIG.maxSteps} steps`,
        );
      }
      steps += 1;
      const problem = effectProblem(step.value);
      if (problem) {
        return abort("ENGINE_INVALID_EFFECT", problem);
      }
      const result = runEffect(step.value, env);
      step = "error" in result ? gen.throw(result.error) : gen.next(result.value);
    }

    const response = step.value;
    if (response.status < 400) return { response };
    return {
      response,
      error: {
        status: response.status,
        code: failure?.code ?? `HTTP_${response.status}`,
        message: failure?.message ?? errorText(response.body) ?? `HTTP ${response.status}`,
        requestId,
        eventSeq: failure?.eventSeq ?? recorder.events.length - 1,
      },
    };
  } catch (err) {
    // The pipeline handles handler errors itself, so this is an engine bug.
    return abort("ENGINE_INTERNAL_ERROR", err instanceof Error ? err.message : String(err));
  }
}

function errorText(body: unknown): string | undefined {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "string" ? error : undefined;
}

function isDuration(ms: unknown): boolean {
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0;
}

function effectProblem(effect: Effect): string | undefined {
  const { kind, ms } = (effect ?? {}) as { kind?: unknown; ms?: unknown };
  if (kind === "log" || kind === "db") return undefined;
  if (kind === "delay" || kind === "trace") {
    if (kind === "trace" && ms === undefined) return undefined;
    return isDuration(ms) ? undefined : `${kind} effect has invalid duration: ${String(ms)}`;
  }
  return `Handler yielded an unknown effect: ${String(kind)}`;
}

function runEffect(effect: Effect, env: EffectEnv): EffectResult {
  const { requestId, clock, recorder, database } = env;
  const line = effect.line !== undefined && { line: effect.line };
  const group =
    "groupKey" in effect && effect.groupKey !== undefined && { groupKey: effect.groupKey };
  switch (effect.kind) {
    case "delay":
      recorder.record({
        requestId,
        stage: "controller",
        type: "DELAY",
        label: effect.label,
        startTime: clock.now(),
        duration: roundMs(effect.ms),
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
    case "trace": {
      const duration = roundMs(effect.ms ?? 0);
      const event = recorder.record({
        requestId,
        stage: effect.stage,
        type: effect.type,
        label: effect.label,
        startTime: clock.now(),
        duration,
        status: effect.status ?? "ok",
        ...line,
        // Copied, so the snapshot keeps the data as it was at this moment.
        ...(effect.snapshot !== undefined && { snapshot: structuredClone(effect.snapshot) }),
        ...group,
      });
      // A failed response event reports an error, it does not cause one.
      if (event.status === "fail" && effect.stage !== "response") {
        env.onFailure({
          code: effect.code ?? effect.type,
          message: effect.label,
          eventSeq: event.seq,
        });
      }
      clock.advance(duration);
      return { value: undefined };
    }
    case "db": {
      const { query } = effect;
      const result = executeQuery(database, query);
      const { error } = result;
      const event = recorder.record({
        requestId,
        stage: "db",
        type: "SQL_QUERY",
        label: effect.label ?? `${query.type.toUpperCase()} ${query.table}`,
        startTime: clock.now(),
        duration: result.duration,
        status: error ? "fail" : "ok",
        ...line,
        snapshot: error
          ? { error: { code: error.code, message: error.message, detail: error.detail } }
          : { rows: result.rows.slice(0, ENGINE_CONFIG.snapshotRowLimit) },
        sql: { ...toSql(query), ...result.stats },
        ...group,
      });
      clock.advance(result.duration);
      if (!error) return { value: result.rows };
      env.onFailure({ code: error.code, message: error.message, eventSeq: event.seq });
      return { error };
    }
  }
}
