import { expect, test } from "@playwright/test";
import { blur, choosePreset, position, run } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await choosePreset(page, "Valid");
});

test("keyboard: Right, Left, Home, End and Space move through the trace", async ({ page }) => {
  await run(page);
  await blur(page);
  const at = (n: number) => expect(position(page)).toContainText(`Event ${n} of 7`);
  const player = page.getByRole("group", { name: "Player" });

  await at(1);
  await page.keyboard.press("ArrowRight");
  await at(2);
  await page.keyboard.press("ArrowRight");
  await at(3);
  await page.keyboard.press("ArrowLeft");
  await at(2);
  await page.keyboard.press("End");
  await at(7);
  await page.keyboard.press("Home");
  await at(1);

  // Space starts playing from here, and Space again pauses where it got to.
  await page.keyboard.press("Space");
  await expect(player.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(position(page)).not.toContainText("Event 1 of 7");
  await page.keyboard.press("Space");
  await expect(player.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(position(page)).toContainText("Step mode");
});

test("keys are left alone while typing in a field", async ({ page }) => {
  await run(page);
  const path = page.getByLabel("Path");
  await path.click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await expect(position(page)).toContainText("Event 1 of 7");
  await expect(path).toHaveValue("/product s");
});

test("with reduced motion, the app opens in step mode", async ({ page }) => {
  await run(page);
  await expect(position(page)).toContainText("Step mode");
  // It stays on the first event until the user moves.
  await page.waitForTimeout(1200);
  await expect(position(page)).toContainText("Event 1 of 7");
  await expect(page.locator(".strip-dot")).toHaveCount(0);
});

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the app opens in play mode and animates to the end", async ({ page }) => {
    await page.getByLabel("Speed").selectOption("4");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("group", { name: "Player" }).getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(position(page)).toContainText("Event 7 of 7");
    await expect(page.getByRole("group", { name: "Player" }).getByRole("button", { name: "Replay" })).toBeVisible();
  });
});
