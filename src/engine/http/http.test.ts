import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createRequest,
  ENGINE_CONFIG,
  fakeJwt,
  HttpError,
  requireAuth,
  runSimulation,
  trace,
  validateBody,
  type Handler,
  type PresetRequest,
  type Route,
  type SimulationResult,
} from "../index";
import { matchPath, matchRoute } from "./router";

const echo: Handler = function* (ctx) {
  return ctx.res.json({
    params: ctx.req.params,
    query: ctx.req.query,
    body: ctx.req.body,
    user: ctx.req.user,
  });
};

const send = (routes: Route[], request: PresetRequest) =>
  runSimulation({
    scenario: { id: "http", name: "HTTP", routes, lines: { bodyParser: 2, errorHandler: 9 } },
    requests: [createRequest(request)],
  });

const types = (result: SimulationResult) => result.events.map((e) => e.type);
const json = { "Content-Type": "application/json" };
const bearer = (role: string, exp = 9_999_999_999) => ({
  Authorization: `Bearer ${fakeJwt({ userId: 5, role, exp })}`,
});

describe("createRequest", () => {
  it("fills defaults and moves a query string out of the path", () => {
    expect(createRequest({ method: "GET", path: "/products?category=audio&limit=5" })).toEqual({
      id: "r1",
      method: "GET",
      path: "/products",
      query: { category: "audio", limit: "5" },
      headers: {},
      body: null,
      startAt: 0,
    });
    expect(
      createRequest({ method: "GET", path: "/p?a=1", query: { a: "2", b: "3" } }).query,
    ).toEqual({ a: "2", b: "3" });
  });
});

describe("router", () => {
  const routes: Route[] = [
    { method: "GET", path: "/products/:id", handler: echo },
    { method: "GET", path: "/products", handler: echo },
    { method: "POST", path: "/products", handler: echo },
  ];

  it("matches path patterns and extracts params", () => {
    expect(matchPath("/products/:id", "/products/42")).toEqual({ id: "42" });
    expect(matchPath("/users/:userId/orders/:orderId", "/users/1/orders/9")).toEqual({
      userId: "1",
      orderId: "9",
    });
    expect(matchPath("/products/:id", "/products/a%20b")).toEqual({ id: "a b" });
    expect(matchPath("/products", "/products/")).toEqual({});
    expect(matchPath("/products/:id", "/products")).toBeUndefined();
    expect(matchPath("/products", "/orders")).toBeUndefined();
  });

  it("tells a missing path from a wrong method", () => {
    expect(matchRoute(routes, "GET", "/products/7")).toMatchObject({
      type: "found",
      params: { id: "7" },
    });
    expect(matchRoute(routes, "GET", "/nope")).toEqual({ type: "not-found" });
    expect(matchRoute(routes, "DELETE", "/products")).toEqual({
      type: "wrong-method",
      allowed: ["GET", "POST"],
    });
  });

  it("answers 404 when no route matches and 405 for a wrong method", () => {
    const missing = send(routes, { method: "GET", path: "/nope" });
    expect(missing.responses.r1?.status).toBe(404);
    expect(types(missing)).toEqual([
      "REQUEST_RECEIVED",
      "BODY_PARSE_SKIPPED",
      "ROUTE_NOT_FOUND",
      "RESPONSE_SENT",
    ]);
    expect(missing.errors).toEqual([
      {
        status: 404,
        code: "ROUTE_NOT_FOUND",
        message: "No route matches GET /nope",
        requestId: "r1",
        eventSeq: 2,
      },
    ]);

    const wrong = send(routes, { method: "DELETE", path: "/products/3" });
    expect(wrong.responses.r1).toMatchObject({ status: 405, headers: { allow: "GET" } });
    expect(wrong.errors[0]?.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("passes params and query to the handler", () => {
    const result = send(routes, { method: "GET", path: "/products/42?fields=name" });
    expect(result.responses.r1?.body).toMatchObject({
      params: { id: "42" },
      query: { fields: "name" },
    });
    expect(result.events[2]).toMatchObject({
      stage: "router",
      type: "ROUTE_MATCHED",
      label: "GET /products/:id",
      snapshot: { params: { id: "42" } },
    });
  });
});

describe("body parsing", () => {
  const routes: Route[] = [{ method: "POST", path: "/echo", handler: echo }];

  it("parses a JSON body and snapshots raw and parsed", () => {
    const result = send(routes, { method: "POST", path: "/echo", headers: json, body: '{"a": 1}' });
    expect(result.responses.r1?.body).toMatchObject({ body: { a: 1 } });
    expect(result.events[1]).toMatchObject({
      stage: "middleware",
      type: "BODY_PARSED",
      status: "ok",
      line: 2,
      snapshot: { raw: '{"a": 1}', parsed: { a: 1 } },
    });
  });

  it("answers 400 for invalid JSON at the parsing stage, before routing", () => {
    const result = send(routes, { method: "POST", path: "/echo", headers: json, body: '{"a": ' });
    expect(result.responses.r1).toMatchObject({
      status: 400,
      body: { error: "Request body is not valid JSON" },
    });
    expect(types(result)).toEqual(["REQUEST_RECEIVED", "BODY_PARSE_FAILED", "RESPONSE_SENT"]);
    expect(result.errors[0]).toMatchObject({ status: 400, code: "BODY_PARSE_FAILED", eventSeq: 1 });
  });

  it("ignores the body without a JSON content type, whatever the header case", () => {
    const ignored = send(routes, { method: "POST", path: "/echo", body: '{"a": 1}' });
    expect(ignored.events[1]).toMatchObject({ type: "BODY_PARSE_SKIPPED", status: "skip" });
    expect((ignored.responses.r1?.body as { body?: unknown }).body).toBeUndefined();

    const lower = send(routes, {
      method: "POST",
      path: "/echo",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: '{"a": 1}',
    });
    expect(lower.events[1]?.type).toBe("BODY_PARSED");
  });
});

describe("middleware chain", () => {
  it("runs middlewares in order and lets one end the request early", () => {
    const first: Handler = function* () {
      yield trace({ stage: "middleware", type: "FIRST", label: "first" });
    };
    const stop: Handler = function* (ctx) {
      yield trace({ stage: "middleware", type: "STOP", label: "stop", status: "fail" });
      return ctx.res.status(429).json({ error: "Slow down" });
    };
    const never: Handler = function* () {
      yield trace({ stage: "middleware", type: "NEVER", label: "never" });
    };

    const passed = send(
      [{ method: "GET", path: "/", middlewares: [first, never], handler: echo }],
      { method: "GET", path: "/" },
    );
    expect(types(passed).slice(3)).toEqual(["FIRST", "NEVER", "RESPONSE_SENT"]);
    expect(passed.responses.r1?.status).toBe(200);

    const stopped = send(
      [{ method: "GET", path: "/", middlewares: [first, stop, never], handler: echo }],
      { method: "GET", path: "/" },
    );
    expect(types(stopped).slice(3)).toEqual(["FIRST", "STOP", "RESPONSE_SENT"]);
    expect(stopped.responses.r1?.status).toBe(429);
    expect(stopped.errors[0]).toMatchObject({ status: 429, code: "STOP" });
  });

  it("sends errors thrown by a middleware or handler to the error handler", () => {
    const teapot: Handler = function* () {
      throw new HttpError(418, "I am a teapot", "TEAPOT");
    };
    const result = send([{ method: "GET", path: "/", middlewares: [teapot], handler: echo }], {
      method: "GET",
      path: "/",
    });
    expect(result.responses.r1).toMatchObject({ status: 418, body: { error: "I am a teapot" } });
    expect(result.events.at(-2)).toMatchObject({ stage: "error", type: "ERROR_HANDLED", line: 9 });
    expect(result.errors[0]).toMatchObject({ status: 418, code: "TEAPOT" });
  });
});

describe("auth middleware", () => {
  const routes: Route[] = [
    { method: "GET", path: "/admin", middlewares: [requireAuth({ role: "admin", line: 7 })], handler: echo },
    { method: "GET", path: "/me", middlewares: [requireAuth()], handler: echo },
  ];
  const get = (path: string, headers?: Record<string, string>) =>
    send(routes, { method: "GET", path, headers });
  const outcome = (result: SimulationResult) => [
    result.responses.r1?.status,
    result.errors[0]?.code,
  ];

  it("rejects missing, unreadable and expired tokens with 401", () => {
    expect(outcome(get("/admin"))).toEqual([401, "AUTH_MISSING_TOKEN"]);
    expect(outcome(get("/admin", { Authorization: "Bearer not-a-token" }))).toEqual([401, "AUTH_INVALID_TOKEN"]);
    expect(outcome(get("/admin", { Authorization: "Basic abc" }))).toEqual([401, "AUTH_INVALID_TOKEN"]);
    expect(outcome(get("/admin", { Authorization: `Bearer ${btoa('{"role":"admin"}')}` }))).toEqual([401, "AUTH_INVALID_TOKEN"]);
    expect(outcome(get("/admin", bearer("admin", ENGINE_CONFIG.nowEpochSeconds - 1)))).toEqual([401, "AUTH_TOKEN_EXPIRED"]);
  });

  it("rejects the wrong role with 403 and never reaches the handler", () => {
    const result = get("/admin", bearer("user"));
    expect(outcome(result)).toEqual([403, "AUTH_FORBIDDEN"]);
    expect(types(result).slice(3)).toEqual(["AUTH_FORBIDDEN", "RESPONSE_SENT"]);
    expect(result.events.at(-2)).toMatchObject({ stage: "auth", status: "fail", line: 7 });
  });

  it("accepts a valid token and sets req.user", () => {
    const admin = get("/admin", bearer("admin"));
    expect(admin.responses.r1?.body).toMatchObject({ user: { userId: 5, role: "admin" } });
    expect(admin.events[3]).toMatchObject({
      stage: "auth",
      type: "AUTH_OK",
      snapshot: { user: { userId: 5, role: "admin" } },
    });
    expect(get("/me", bearer("user")).responses.r1?.status).toBe(200);
  });
});

describe("validation middleware", () => {
  const schema = z.object({ name: z.string().min(1), price: z.number().positive() });
  const routes: Route[] = [
    { method: "POST", path: "/items", middlewares: [validateBody(schema, { line: 4 })], handler: echo },
  ];
  const post = (body: unknown, headers: Record<string, string> = json) =>
    send(routes, { method: "POST", path: "/items", headers, body: JSON.stringify(body) });

  it("passes the validated DTO on and drops unknown fields", () => {
    const result = post({ name: "Lamp", price: 30, role: "admin" });
    expect(result.responses.r1?.body).toMatchObject({ body: { name: "Lamp", price: 30 } });
    expect(result.events[3]).toMatchObject({
      stage: "validation",
      type: "VALIDATION_OK",
      line: 4,
      snapshot: {
        raw: { name: "Lamp", price: 30, role: "admin" },
        dto: { name: "Lamp", price: 30 },
      },
    });
  });

  it("answers 400 with one message per field and never reaches the handler", () => {
    const result = post({ price: -5 });
    const body = result.responses.r1?.body as { error: string; fields: Record<string, string> };
    expect(result.responses.r1?.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(Object.keys(body.fields)).toEqual(["name", "price"]);
    expect(types(result).slice(3)).toEqual(["VALIDATION_FAILED", "RESPONSE_SENT"]);
    expect(result.events[3]).toMatchObject({
      status: "fail",
      snapshot: { raw: { price: -5 }, fields: body.fields },
    });
    expect(result.errors[0]).toMatchObject({ status: 400, code: "VALIDATION_FAILED", eventSeq: 3 });
  });

  it("reports a missing body as one error on the body itself", () => {
    const result = post({ name: "Lamp", price: 30 }, {});
    const body = result.responses.r1?.body as { fields: Record<string, string> };
    expect(result.responses.r1?.status).toBe(400);
    expect(Object.keys(body.fields)).toEqual(["body"]);
  });
});
