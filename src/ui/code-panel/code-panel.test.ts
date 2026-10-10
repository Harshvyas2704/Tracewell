import { describe, expect, it } from "vitest";
import { createRequest, runSimulation, scenarioCode, type SimEvent } from "../../engine";
import { getScenario } from "../../scenarios";
import { buildDataFlow } from "../inspector/flowItems";
import { tokenize } from "./highlight";
import { blockEnd, lineStates } from "./lines";

const scenario = getScenario("product-api")!;
const lines = (scenarioCode(scenario) ?? "").replace(/\n$/, "").split("\n");

const eventsOf = (presetId: string): SimEvent[] => {
  const preset = scenario.presets?.find((p) => p.id === presetId);
  if (!preset) throw new Error(`No preset "${presetId}"`);
  return runSimulation({ scenario, requests: [createRequest(preset.request)] }).events;
};

// 1-based numbers of the lines in a given state with the cursor at an event.
const linesWhere = (events: SimEvent[], cursor: number, key: "current" | "notReached" | "failed") =>
  lineStates(lines, events, cursor).flatMap((state, i) => (state[key] ? [i + 1] : []));
const text = (line: number) => lines[line - 1] ?? "";

describe("tokenize", () => {
  it("splits a line into keywords, strings, numbers and comments", () => {
    expect(tokenize('const id = Number("42"); // parse')).toEqual([
      { text: "const", kind: "keyword" },
      { text: " id = Number(", kind: "plain" },
      { text: '"42"', kind: "string" },
      { text: "); ", kind: "plain" },
      { text: "// parse", kind: "comment" },
    ]);
    expect(tokenize("limit || 20").at(-1)).toEqual({ text: "20", kind: "number" });
    expect(tokenize("")).toEqual([]);
  });

  it("keeps the text intact and leaves keywords inside strings alone", () => {
    for (const line of lines) {
      expect(tokenize(line).map((t) => t.text).join("")).toBe(line);
    }
    expect(tokenize('"return if const"')).toEqual([{ text: '"return if const"', kind: "string" }]);
  });
});

describe("blockEnd", () => {
  it("finds the closing line of each route", () => {
    const start = (snippet: string) => lines.findIndex((l) => l.includes(snippet)) + 1;
    const get = start('app.get("/products/:id"');
    const post = start("app.post(");
    expect(text(blockEnd(lines, get))).toBe("});");
    expect(blockEnd(lines, get)).toBeLessThan(start('app.get("/products",'));
    expect(text(blockEnd(lines, post))).toBe(");");
    expect(blockEnd(lines, post)).toBeGreaterThan(start("res.status(201)"));
    expect(blockEnd(["const a = 1;"], 1)).toBe(1);
  });
});

describe("code lines at the cursor", () => {
  it("highlights the matching line at each step of POST /products", () => {
    const events = eventsOf("valid");
    const current = events.map((_, cursor) => text(linesWhere(events, cursor, "current")[0] ?? 0).trim());
    expect(current).toEqual([
      "", // the request arriving has no code line
      "app.use(express.json());",
      "app.post(",
      'requireAuth({ role: "admin" }),',
      "validate(createProductSchema),",
      '"INSERT INTO products (name, price, stock, category) VALUES ($1, $2, $3, $4) RETURNING *",',
      "res.status(201).json(rows[0]);",
    ]);
    // Nothing is marked as not reached in a run that succeeds.
    expect(linesWhere(events, events.length - 1, "notReached")).toEqual([]);
  });

  it("marks executed lines only up to the cursor", () => {
    const events = eventsOf("valid");
    const executedAt = (cursor: number) =>
      lineStates(lines, events, cursor).filter((s) => s.executed).length;
    expect([0, 1, 2, 6].map(executedAt)).toEqual([0, 1, 2, 6]);
  });

  it("marks the rest of the route as not reached after a validation failure", () => {
    const events = eventsOf("invalid-value");
    const failedAt = events.findIndex((e) => e.type === "VALIDATION_FAILED");

    expect(linesWhere(events, failedAt - 1, "notReached")).toEqual([]);
    expect(linesWhere(events, failedAt, "failed").map(text)).toEqual([
      "  validate(createProductSchema),",
    ]);
    const skipped = linesWhere(events, failedAt, "notReached").map((n) => text(n).trim());
    expect(skipped).toContain("const { rows } = await db.query(");
    expect(skipped).toContain("res.status(201).json(rows[0]);");
    expect(skipped).not.toContain('requireAuth({ role: "admin" }),');
    // Only code inside this route is affected.
    expect(skipped.some((line) => line.startsWith("app.use((err"))).toBe(false);
  });

  it("does not cut the route short for a failure the handler recovered from", () => {
    const events = eventsOf("valid").map((event) =>
      event.type === "SQL_QUERY" ? { ...event, status: "fail" as const, handled: true } : event,
    );
    expect(linesWhere(events, events.length - 1, "notReached")).toEqual([]);
  });

  it("marks the success path as not reached when the handler returns 404", () => {
    const events = eventsOf("not-found");
    const skipped = linesWhere(events, events.length - 1, "notReached").map((n) => text(n).trim());
    expect(skipped).toContain("res.json(rows[0]);");
    expect(skipped).not.toContain('return res.status(404).json({ error: "Product not found" });');
  });
});

describe("data flow", () => {
  const ids = (events: SimEvent[], cursor: number) =>
    buildDataFlow(events, cursor).map((item) => item.id.replace(/-\d+$/, ""));

  it("adds each stop only once the cursor reaches it", () => {
    const events = eventsOf("valid");
    expect(events.map((_, cursor) => ids(events, cursor))).toEqual([
      ["raw"],
      ["raw", "parsed"],
      ["raw", "parsed"],
      ["raw", "parsed"],
      ["raw", "parsed", "dto"],
      ["raw", "parsed", "dto", "sql-params", "db-rows"],
      ["raw", "parsed", "dto", "sql-params", "db-rows", "response"],
    ]);

    const flow = buildDataFlow(events, events.length - 1);
    expect(flow.find((item) => item.id === "sql-params")).toMatchObject({
      value: ["Walnut Bookshelf", 129.5, 12, "office"],
      note: expect.stringContaining("INSERT INTO products"),
    });
    expect(flow.find((item) => item.id === "db-rows")).toMatchObject({
      title: "DB row",
      value: { id: 1001, name: "Walnut Bookshelf" },
    });
  });

  it("shows raw and parsed, then the failure, and no DTO when validation fails", () => {
    const events = eventsOf("invalid-value");
    const flow = buildDataFlow(events, events.length - 1);
    expect(flow.map((item) => item.title)).toEqual([
      "Raw body",
      "Parsed JSON",
      "Validation failed",
      "Response body",
    ]);
    expect(flow[2]).toMatchObject({ failed: true, value: { price: expect.any(String) } });
    expect(flow.some((item) => item.id === "dto")).toBe(false);
  });

  it("shows nothing for a body-less request until the query runs", () => {
    const events = eventsOf("list-by-category");
    expect(ids(events, 0)).toEqual([]);
    const flow = buildDataFlow(events, events.length - 1);
    expect(flow.map((item) => item.title)).toEqual(["SQL params", "DB rows (5)", "Response body"]);
  });

  it("shows a failed query in place of its rows", () => {
    const events = eventsOf("duplicate-name");
    const titles = buildDataFlow(events, events.length - 1).map((item) => item.title);
    expect(titles).toContain("Query failed");
    expect(titles).not.toContain("DB row");
  });
});
