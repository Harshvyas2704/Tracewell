import { expect, test, type Page } from "@playwright/test";
import { choosePreset, openScenario, position } from "./helpers";

// Measures how long the app takes to react, on the production build. Times
// are taken inside the page, from the user's action to the moment the DOM
// shows the result, so they do not include Playwright's own overhead.
//
// The limits are loose on purpose. This test logs numbers and catches large
// regressions. It is not a benchmark.
const RUN_LIMIT_MS = 500;
const STEP_LIMIT_MS = 200;
const RUNS = 7;
const STEPS = 12;

type Timing = { median: number; max: number; all: number[] };

const summarize = (samples: number[]): Timing => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    max: sorted.at(-1) ?? 0,
    all: samples.map((ms) => Math.round(ms * 10) / 10),
  };
};

// Clicks Run and waits until the first trace row is in the DOM.
const timeRun = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const run = [...document.querySelectorAll("button")].find(
          (button) => button.textContent?.trim() === "Run",
        );
        const before = document.querySelector(".trace-list");
        const observer = new MutationObserver(() => {
          const list = document.querySelector(".trace-list");
          // A new run replaces the trace list, so wait for a different one.
          if (list && list !== before && list.querySelector(".trace-row")) {
            observer.disconnect();
            resolve(performance.now() - start);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const start = performance.now();
        run?.click();
      }),
  );

// Presses an arrow key and waits until the position text changes.
const timeStep = (page: Page, key: "ArrowRight" | "ArrowLeft"): Promise<number> =>
  page.evaluate(
    (key) =>
      new Promise<number>((resolve) => {
        const target = document.querySelector(".player-position");
        const before = target?.textContent;
        const observer = new MutationObserver(() => {
          if (target?.textContent !== before) {
            observer.disconnect();
            resolve(performance.now() - start);
          }
        });
        if (target) {
          observer.observe(target, { childList: true, subtree: true, characterData: true });
        }
        const start = performance.now();
        window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      }),
    key,
  );

async function measure(page: Page, label: string): Promise<{ run: Timing; step: Timing }> {
  const runs: number[] = [];
  for (let i = 0; i < RUNS; i++) runs.push(await timeRun(page));
  await expect(position(page)).toContainText("Event 1 of");

  // Four steps forward, four back, and so on, so a short trace never runs out.
  const steps: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    steps.push(await timeStep(page, Math.floor(i / 4) % 2 === 0 ? "ArrowRight" : "ArrowLeft"));
  }

  const result = { run: summarize(runs), step: summarize(steps) };
  const line = (name: string, t: Timing) =>
    `${label} | ${name}: median ${t.median.toFixed(1)} ms, max ${t.max.toFixed(1)} ms | ${t.all.join(", ")}`;
  console.log(line("Run to first trace row", result.run));
  console.log(line("Step (arrow key)", result.step));
  test.info().annotations.push(
    { type: "run", description: line("Run", result.run) },
    { type: "step", description: line("Step", result.step) },
  );
  return result;
}

test("Product API, Valid preset", async ({ page }) => {
  await page.goto("/");
  await choosePreset(page, "Valid");
  const { run, step } = await measure(page, "Product API / Valid   ");
  expect(run.median).toBeLessThan(RUN_LIMIT_MS);
  expect(step.median).toBeLessThan(STEP_LIMIT_MS);
});

test("N+1, default run", async ({ page }) => {
  await openScenario(page, "Orders: N+1 queries");
  const { run, step } = await measure(page, "N+1 / default (55 ev.)");
  expect(run.median).toBeLessThan(RUN_LIMIT_MS);
  expect(step.median).toBeLessThan(STEP_LIMIT_MS);
});
