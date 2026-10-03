import { it } from "vitest";
import { createRequest, runSimulation } from "./engine";
import { getScenario } from "./scenarios";

it("scratch", () => {
  const scenario = getScenario("product-api")!;
  for (const preset of scenario.presets ?? []) {
    const result = runSimulation({
      scenario,
      requests: [createRequest(preset.request)],
    });
    console.log(`\n${preset.label}: ${result.responses.r1?.status}`);
    console.table(
      result.events.map((e) => ({
        stage: e.stage,
        label: e.label.slice(0, 50),
        status: e.status,
        at: e.startTime,
        ms: e.duration,
        line: e.line,
      })),
    );
  }
});
