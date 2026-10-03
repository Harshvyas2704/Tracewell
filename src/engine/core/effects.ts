import type { DelayEffect, LogEffect, TraceEffect } from "./types";

// Effect creators. Handlers yield these; the runner decides what they do.

export function delay(ms: number, label: string, line?: number): DelayEffect {
  return { kind: "delay", ms, label, ...(line !== undefined && { line }) };
}

export function log(label: string, line?: number): LogEffect {
  return { kind: "log", label, ...(line !== undefined && { line }) };
}

export function trace(event: Omit<TraceEffect, "kind">): TraceEffect {
  return { kind: "trace", ...event };
}
