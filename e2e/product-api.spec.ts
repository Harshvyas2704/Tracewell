import { expect, test } from "@playwright/test";
import { choosePreset, panel, run, runToEnd } from "./helpers";

const PRESETS: [name: string, status: string][] = [
  ["Get product", "200 OK"],
  ["List by category", "200 OK"],
  ["Valid", "201 Created"],
  ["Missing field", "400 Bad Request"],
  ["Invalid value", "400 Bad Request"],
  ["Not found", "404 Not Found"],
  ["No token", "401 Unauthorized"],
  ["Wrong role", "403 Forbidden"],
  ["Duplicate name", "409 Conflict"],
];

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("every preset runs and shows its status", async ({ page }) => {
  for (const [name, status] of PRESETS) {
    await choosePreset(page, name);
    await runToEnd(page);
    await expect(panel(page, "Response"), name).toContainText(status);
  }
});

test("invalid JSON is rejected with 400 at the parsing stage", async ({ page }) => {
  await choosePreset(page, "Valid");
  await page.getByLabel("JSON body").fill('{ "name": "Lamp", ');
  await expect(page.getByText(/Not valid JSON/)).toBeVisible();

  await runToEnd(page);
  await expect(panel(page, "Response")).toContainText("400 Bad Request");

  const trace = panel(page, "Trace");
  await expect(
    trace.getByRole("button", { name: /middleware.*Request body is not valid JSON/ }),
  ).toBeVisible();
  // The request never reached the router.
  await expect(trace.getByRole("button", { name: /router/ })).toHaveCount(0);
  await expect(trace.getByRole("button")).toHaveCount(3);
});

test("a wrong method gets 404, like Express", async ({ page }) => {
  await page.getByLabel("Method").selectOption("DELETE");
  await page.getByLabel("Path").fill("/products/42");
  await runToEnd(page);

  await expect(panel(page, "Response")).toContainText("404 Not Found");
  await expect(panel(page, "Response")).toContainText("Cannot DELETE /products/42");
  await expect(
    panel(page, "Trace").getByRole("button", {
      name: /No route for DELETE \/products\/42 \(GET exists\)/,
    }),
  ).toBeVisible();
});

test("the response appears only at the end of the trace", async ({ page }) => {
  await choosePreset(page, "Valid");
  await run(page);
  await expect(panel(page, "Response")).toContainText("Not sent yet");
  await page.getByRole("button", { name: "Skip to the end" }).click();
  await expect(panel(page, "Response")).toContainText("201 Created");
});
