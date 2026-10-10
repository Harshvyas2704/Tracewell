import { expect, test } from "@playwright/test";
import { openScenario, runToEnd } from "./helpers";

test.describe("narrow viewport", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  const overflows = () =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth;

  test("the page never scrolls sideways", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(overflows)).toBe(false);

    await runToEnd(page);
    expect(await page.evaluate(overflows)).toBe(false);

    await openScenario(page, "Orders: N+1 queries");
    await page.getByText("Why", { exact: true }).click();
    await runToEnd(page);
    await page.getByRole("checkbox", { name: /Eager load items/ }).check();
    await runToEnd(page);
    await expect(page.getByRole("region", { name: "Compare runs" }).getByRole("table")).toBeVisible();
    expect(await page.evaluate(overflows)).toBe(false);
  });
});
