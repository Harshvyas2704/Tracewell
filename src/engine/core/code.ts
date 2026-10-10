import type { Fixes, PerFixes, Scenario } from "./types";

// Resolves a part of a scenario for the fixes that are on.
export function withFixes<T>(value: PerFixes<T>, fixes: Fixes): T {
  return typeof value === "function" ? (value as (fixes: Fixes) => T)(fixes) : value;
}

// The display code of a scenario with the given fixes switched on.
export function scenarioCode(scenario: Scenario, fixes: Fixes = {}): string | undefined {
  return withFixes(scenario.code, fixes);
}

// Finds the 1-based line of display code that contains a snippet, so handlers
// can point at code without hard-coded line numbers. The snippet must appear
// on exactly one line.
export function lineOf(code: string, snippet: string): number {
  const matches: number[] = [];
  code.split("\n").forEach((text, i) => {
    if (text.includes(snippet)) matches.push(i + 1);
  });
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one display code line containing "${snippet}", found ${matches.length}`,
    );
  }
  return matches[0] as number;
}
