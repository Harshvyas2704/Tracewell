import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Lints short code strings as if they were files in the project, using the
// real eslint.config.js. This keeps the engine's guard rules from being
// removed or loosened without a test failing.
const eslint = new ESLint();

const rulesBroken = async (filePath: string, code: string): Promise<string[]> => {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.severity === 2)
    .map((message) => message.ruleId ?? "(parse error)");
};

const GUARDED = ["src/engine/core/example.ts", "src/scenarios/example/handlers.ts"];

describe("lint guard for the engine and scenarios", { timeout: 30_000 }, () => {
  it.each(GUARDED)("blocks React imports in %s", async (file) => {
    expect(await rulesBroken(file, 'import React from "react";\nexport const x = React;\n')).toEqual([
      "no-restricted-imports",
    ]);
    expect(
      await rulesBroken(file, 'import { createRoot } from "react-dom/client";\nexport const x = createRoot;\n'),
    ).toEqual(["no-restricted-imports"]);
  });

  it.each(GUARDED)("blocks imports from a ui folder in %s", async (file) => {
    expect(
      await rulesBroken(file, 'import { Header } from "../../ui/layout";\nexport const x = Header;\n'),
    ).toEqual(["no-restricted-imports"]);
    expect(
      await rulesBroken(file, 'import { formatMs } from "../ui/format";\nexport const x = formatMs;\n'),
    ).toEqual(["no-restricted-imports"]);
  });

  it.each(GUARDED)("blocks real time and unseeded randomness in %s", async (file) => {
    expect(await rulesBroken(file, "export const now = Date.now();\n")).toEqual([
      "no-restricted-properties",
    ]);
    expect(await rulesBroken(file, "export const roll = Math.random();\n")).toEqual([
      "no-restricted-properties",
    ]);
    expect(await rulesBroken(file, "setTimeout(() => {}, 10);\n")).toEqual(["no-restricted-globals"]);
    expect(await rulesBroken(file, "setInterval(() => {}, 10);\n")).toEqual(["no-restricted-globals"]);
  });

  it("allows a normal import inside the engine", async () => {
    const code = 'import { createClock } from "./clock";\nexport const clock = createClock();\n';
    expect(await rulesBroken("src/engine/core/example.ts", code)).toEqual([]);
  });

  it("allows a scenario to import the engine", async () => {
    const code = 'import { db } from "../../engine";\nexport const query = db.select("users");\n';
    expect(await rulesBroken("src/scenarios/example/handlers.ts", code)).toEqual([]);
  });

  it("does not apply to UI files", async () => {
    const code =
      'import { useState } from "react";\nexport const useNow = () => useState(() => Date.now());\n';
    expect(await rulesBroken("src/ui/example/useNow.ts", code)).toEqual([]);
  });
});
