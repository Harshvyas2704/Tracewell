import { describe, expect, it } from "vitest";
import { createRequest, runSimulation, scenarioCode, type SimulationResult } from "../../engine";
import { getScenario, scenarios } from "../index";
import { productApi } from "./index";

const runPreset = (id: string): SimulationResult => {
  const preset = productApi.presets?.find((p) => p.id === id);
  if (!preset) throw new Error(`No preset "${id}"`);
  return runSimulation({ scenario: productApi, requests: [createRequest(preset.request)] });
};

const sqlEvents = (result: SimulationResult) => result.events.filter((e) => e.stage === "db");
const types = (result: SimulationResult) => result.events.map((e) => e.type);
const response = (result: SimulationResult) => result.responses.r1;
const codeLines = (scenarioCode(productApi) ?? "").split("\n");

describe("product-api", () => {
  it("is in the registry", () => {
    expect(scenarios).toContain(productApi);
    expect(getScenario("product-api")).toBe(productApi);
    expect(getScenario("nope")).toBeUndefined();
  });

  it("has 1,000 products", () => {
    const { tables } = runPreset("get-product").worldAfter;
    expect(tables.products).toHaveLength(1000);
    expect(tables.users).toHaveLength(3);
  });

  it("GET /products/42 gives 200, one SQL event, no errors", () => {
    const result = runPreset("get-product");
    expect(response(result)).toMatchObject({
      status: 200,
      body: { id: 42, name: "Lunar Toaster", category: "kitchen" },
    });
    expect(sqlEvents(result)).toHaveLength(1);
    expect(sqlEvents(result)[0]?.sql).toMatchObject({
      text: "SELECT * FROM products WHERE id = $1",
      params: [42],
      plan: "Index Scan",
    });
    expect(result.errors).toEqual([]);
  });

  it("GET /products/999999 gives 404 after a DB event", () => {
    const result = runPreset("not-found");
    expect(response(result)).toMatchObject({ status: 404, body: { error: "Product not found" } });
    expect(types(result).slice(-2)).toEqual(["SQL_QUERY", "RESPONSE_SENT"]);
    expect(sqlEvents(result)[0]?.sql?.rowsReturned).toBe(0);
    expect(result.errors).toEqual([
      expect.objectContaining({ status: 404, message: "Product not found" }),
    ]);
  });

  it("GET /products/abc gives 400 and no DB event", () => {
    const result = runSimulation({
      scenario: productApi,
      requests: [createRequest({ method: "GET", path: "/products/abc" })],
    });
    expect(response(result)?.status).toBe(400);
    expect(sqlEvents(result)).toHaveLength(0);
  });

  it("GET /products?category= filters with a seq scan and honours the limit", () => {
    const result = runPreset("list-by-category");
    const body = response(result)?.body as { count: number; items: { category: string }[] };
    expect(body.count).toBe(5);
    expect(body.items.every((item) => item.category === "audio")).toBe(true);
    expect(sqlEvents(result)[0]?.sql).toMatchObject({
      text: "SELECT * FROM products WHERE category = $1 ORDER BY id LIMIT $2",
      params: ["audio", 5],
      plan: "Seq Scan",
      rowsScanned: 1000,
    });

    const all = runSimulation({
      scenario: productApi,
      requests: [createRequest({ method: "GET", path: "/products" })],
    });
    expect((response(all)?.body as { count: number }).count).toBe(20);
    expect(sqlEvents(all)[0]?.sql?.text).toBe("SELECT * FROM products ORDER BY id LIMIT $1");
  });

  it("POST /products with a valid body creates the product", () => {
    const result = runPreset("valid");
    expect(response(result)).toMatchObject({
      status: 201,
      body: { id: 1001, name: "Walnut Bookshelf", price: 129.5, stock: 12, category: "office" },
    });
    expect(types(result)).toEqual([
      "REQUEST_RECEIVED",
      "BODY_PARSED",
      "ROUTE_MATCHED",
      "AUTH_OK",
      "VALIDATION_OK",
      "SQL_QUERY",
      "RESPONSE_SENT",
    ]);
    expect(result.worldAfter.tables.products).toHaveLength(1001);
    expect(result.errors).toEqual([]);
  });

  it("POST /products without token gives 401 and no DB event", () => {
    const result = runPreset("no-token");
    expect(response(result)?.status).toBe(401);
    expect(sqlEvents(result)).toHaveLength(0);
    expect(result.errors[0]?.code).toBe("AUTH_MISSING_TOKEN");
  });

  it("POST /products with the wrong role gives 403 and no DB event", () => {
    const result = runPreset("wrong-role");
    expect(response(result)?.status).toBe(403);
    expect(sqlEvents(result)).toHaveLength(0);
  });

  it("POST /products with price: -5 gives 400 and no DB event", () => {
    const result = runPreset("invalid-value");
    const body = response(result)?.body as { fields: Record<string, string> };
    expect(response(result)?.status).toBe(400);
    expect(Object.keys(body.fields)).toEqual(["price"]);
    expect(sqlEvents(result)).toHaveLength(0);
    expect(result.worldAfter.tables.products).toHaveLength(1000);
  });

  it("POST /products with a missing field gives 400 and no DB event", () => {
    const result = runPreset("missing-field");
    const body = response(result)?.body as { fields: Record<string, string> };
    expect(response(result)?.status).toBe(400);
    expect(Object.keys(body.fields)).toEqual(["price"]);
    expect(sqlEvents(result)).toHaveLength(0);
  });

  it("duplicate product name gives 409", () => {
    const result = runPreset("duplicate-name");
    expect(response(result)).toMatchObject({
      status: 409,
      body: { detail: "Key (name)=(Lunar Toaster) already exists." },
    });
    expect(types(result).slice(-3)).toEqual(["SQL_QUERY", "ERROR_HANDLED", "RESPONSE_SENT"]);
    expect(result.errors[0]).toMatchObject({ status: 409, code: "23505" });
    expect(result.worldAfter.tables.products).toHaveLength(1000);
  });

  it("gives the same result for the same preset twice", () => {
    expect(runPreset("valid")).toEqual(runPreset("valid"));
  });

  it("points every event at the display code line doing that work", () => {
    const expected: Record<string, [string, string][]> = {
      "get-product": [
        ["BODY_PARSE_SKIPPED", "express.json()"],
        ["ROUTE_MATCHED", 'app.get("/products/:id"'],
        ["SQL_QUERY", "WHERE id = $1"],
        ["RESPONSE_SENT", "res.json(rows[0])"],
      ],
      "not-found": [["RESPONSE_SENT", "status(404)"]],
      "list-by-category": [
        ["ROUTE_MATCHED", 'app.get("/products",'],
        ["SQL_QUERY", "WHERE category = $1"],
        ["RESPONSE_SENT", "res.json({ count"],
      ],
      valid: [
        ["BODY_PARSED", "express.json()"],
        ["ROUTE_MATCHED", "app.post("],
        ["AUTH_OK", "requireAuth("],
        ["VALIDATION_OK", "validate(createProductSchema)"],
        ["SQL_QUERY", "INSERT INTO products"],
        ["RESPONSE_SENT", "status(201)"],
      ],
      "no-token": [
        ["AUTH_MISSING_TOKEN", "requireAuth("],
        ["RESPONSE_SENT", "requireAuth("],
      ],
      "invalid-value": [["VALIDATION_FAILED", "validate(createProductSchema)"]],
      "duplicate-name": [
        ["ERROR_HANDLED", "app.use((err"],
        ["RESPONSE_SENT", "app.use((err"],
      ],
    };

    for (const [presetId, checks] of Object.entries(expected)) {
      const result = runPreset(presetId);
      for (const [type, snippet] of checks) {
        const event = result.events.find((e) => e.type === type);
        const text = codeLines[(event?.line ?? 0) - 1];
        expect(text, `${presetId} ${type}`).toContain(snippet);
      }
    }
  });
});
