import type { SimEvent } from "../../engine";

// The boxes of the pipeline strip, in the order a request passes them.
const STRIP = [
  { id: "parse", label: "Parse" },
  { id: "router", label: "Router" },
  { id: "middleware", label: "Middleware" },
  { id: "auth", label: "Auth" },
  { id: "validation", label: "Validation" },
  { id: "controller", label: "Controller" },
  { id: "db", label: "DB" },
  { id: "error", label: "Error handler" },
  { id: "response", label: "Response" },
] as const;

export type StripId = (typeof STRIP)[number]["id"];

export type StripItem = {
  id: StripId;
  label: string;
  used: boolean; // this run passes through it at some point
  visited: boolean; // reached at or before the cursor
  failed: boolean; // a visited event here failed
  current: boolean; // the event at the cursor is here
};

export function stripIdOf(event: SimEvent): StripId {
  switch (event.stage) {
    case "network":
      return "parse";
    case "middleware":
      // Reading the request and its body is the Parse box. Other middlewares
      // get their own box.
      return event.type.startsWith("BODY_") ? "parse" : "middleware";
    case "router":
    case "auth":
    case "validation":
    case "controller":
    case "response":
    case "error":
      return event.stage;
    case "db":
    case "pool":
    case "lock":
      return "db";
    case "eventloop":
      return "controller";
  }
}

// The error handler box only appears in runs that reach it.
export function stripItems(events: SimEvent[], cursor: number): StripItem[] {
  const ids = events.map(stripIdOf);
  const currentId = ids[cursor];
  return STRIP.filter((box) => box.id !== "error" || ids.includes("error")).map((box) => {
    const visited = ids.some((id, i) => id === box.id && i <= cursor);
    return {
      ...box,
      used: ids.includes(box.id),
      visited,
      failed: events.some((e, i) => ids[i] === box.id && i <= cursor && e.status === "fail"),
      current: box.id === currentId,
    };
  });
}
