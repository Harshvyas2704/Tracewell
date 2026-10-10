import { createClock } from "./core/clock";
import { withFixes } from "./core/code";
import { ENGINE_CONFIG } from "./core/config";
import { createRecorder } from "./core/recorder";
import { createRng } from "./core/rng";
import { runRequest } from "./core/runner";
import type { SimulationInput, SimulationResult } from "./core/types";
import { createDatabase, snapshotDatabase } from "./db/database";
import { requestPipeline } from "./http/pipeline";
import { computeMetrics } from "./metrics";

export { lineOf, scenarioCode, withFixes } from "./core/code";
export { COST_CONFIG, ENGINE_CONFIG } from "./core/config";
export { delay, log, trace } from "./core/effects";
export type * from "./core/types";
export type { Rng } from "./core/rng";
export { db } from "./db/effects";
export { DbError, isDbError } from "./db/errors";
export type { QueryCost } from "./db/cost";
export type * from "./db/types";
export { fakeJwt, requireAuth } from "./http/auth";
export { HttpError } from "./http/errors";
export { createRequest } from "./http/request";
export { statusLabel } from "./http/response";
export { validateBody } from "./http/validate";

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
  const database = createDatabase(withFixes(scenario.world, fixes) ?? []);
  const rng = createRng(seed);
  const outcome = runRequest({
    requestId: req.id,
    start: () => requestPipeline({ scenario, req, fixes, rng }),
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
