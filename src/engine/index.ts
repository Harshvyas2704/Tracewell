import { createClock } from "./core/clock";
import { ENGINE_CONFIG } from "./core/config";
import { createRecorder } from "./core/recorder";
import { createRng } from "./core/rng";
import { runHandler } from "./core/runner";
import type { SimulationInput, SimulationResult } from "./core/types";
import { createDatabase, snapshotDatabase } from "./db/database";
import { computeMetrics } from "./metrics";

export { delay, log } from "./core/effects";
export { ENGINE_CONFIG } from "./core/config";
export type * from "./core/types";
export type { Rng } from "./core/rng";
export { COST_CONFIG } from "./db/cost";
export { db } from "./db/effects";
export { DbError, isDbError } from "./db/errors";
export type * from "./db/types";

// Public engine API. Same scenario + requests + fixes + seed always gives the
// same result.
export function runSimulation(input: SimulationInput): SimulationResult {
  const { scenario, requests, fixes = {}, seed = ENGINE_CONFIG.defaultSeed } = input;
  const [req] = requests;
  if (!req || requests.length !== 1) {
    // Concurrent requests arrive with the scheduler in Phase 9.
    throw new Error(
      `runSimulation needs exactly one request, got ${requests.length}`,
    );
  }

  const clock = createClock(req.startAt);
  const recorder = createRecorder();
  // A fresh database per run: one simulation never leaks into the next.
  const database = createDatabase(scenario.world ?? []);
  const outcome = runHandler({
    handler: scenario.handler,
    ctx: { req, fixes, rng: createRng(seed) },
    clock,
    recorder,
    database,
  });

  return {
    requests,
    responses: { [req.id]: outcome.response },
    events: recorder.events,
    metrics: computeMetrics(recorder.events),
    errors: outcome.error ? [outcome.error] : [],
    worldAfter: snapshotDatabase(database),
    seed,
  };
}
