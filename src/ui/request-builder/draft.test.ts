import { describe, expect, it } from "vitest";
import { draftFromPreset, draftToRequest, emptyDraft, jsonProblem, newPair } from "./draft";

describe("request draft", () => {
  it("round-trips a preset into a request", () => {
    const draft = draftFromPreset({
      method: "POST",
      path: "/products",
      query: { dryRun: "1" },
      headers: { "Content-Type": "application/json" },
      body: '{"name":"Lamp"}',
    });
    expect(draftToRequest(draft)).toEqual({
      id: "r1",
      method: "POST",
      path: "/products",
      query: { dryRun: "1" },
      headers: { "Content-Type": "application/json" },
      body: '{"name":"Lamp"}',
      startAt: 0,
    });
  });

  it("ignores unnamed rows, trims names and sends no body when it is blank", () => {
    const draft = {
      ...emptyDraft(),
      path: "  ",
      headers: [newPair("", "orphan"), newPair(" X-Test ", "1"), newPair("X-Test", "2")],
      body: "  \n",
    };
    expect(draftToRequest(draft)).toMatchObject({
      path: "/",
      headers: { "X-Test": "2" },
      body: null,
    });
  });

  it("accepts a query string typed into the path", () => {
    const draft = { ...emptyDraft(), path: "/products?category=audio", query: [newPair("limit", "5")] };
    expect(draftToRequest(draft)).toMatchObject({
      path: "/products",
      query: { category: "audio", limit: "5" },
    });
  });

  it("reports invalid JSON and stays quiet for valid or empty bodies", () => {
    expect(jsonProblem("")).toBeUndefined();
    expect(jsonProblem('{"a": 1}')).toBeUndefined();
    expect(jsonProblem('{"a": ')).toEqual(expect.any(String));
  });
});
