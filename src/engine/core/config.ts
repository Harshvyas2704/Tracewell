// Engine limits and defaults.
export const ENGINE_CONFIG = {
  // Effects a single simulation may run before it is stopped with an error.
  maxSteps: 10_000,
  defaultSeed: 1,
  // Rows of a query result kept in the event snapshot. The handler still
  // receives every row.
  snapshotRowLimit: 5,
  // The simulated wall clock (Unix seconds) used to check token expiry.
  // Fixed so runs never depend on the real date.
  nowEpochSeconds: 1_800_000_000,
};

// Every cost constant in the engine lives here. These are model parameters
// chosen to make the shape of the work visible. They are not benchmarks of a
// real Node.js or PostgreSQL server.
export const COST_CONFIG = {
  // HTTP pipeline
  requestMs: 0.1, // accept the connection and read the headers
  bodyParseMs: 0.05,
  routeMs: 0.02,
  authMs: 0.05,
  validationMs: 0.05,
  responseMs: 0.1,
  perJsonKbMs: 0.02, // parsing a request body or serializing a response body

  // Database
  baseMs: 1, // round trip, parse and plan
  perRowScanMs: 0.005,
  perRowSentMs: 0.01,
  perSortCompareMs: 0.002, // multiplied by n * log2(n)
  perRowWriteMs: 0.1,
};
