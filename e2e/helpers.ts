import { expect, type Locator, type Page } from "@playwright/test";

// Panels are <section> elements labelled by their heading. The name is matched
// from its start, because the trace heading also carries the event count.
export const panel = (page: Page, name: string): Locator =>
  page.getByRole("region", { name: new RegExp(`^${name}`) });

export const position = (page: Page): Locator => page.getByText(/^Event \d+ of \d+/);

export async function openScenario(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Scenario").selectOption({ label: name });
}

export async function choosePreset(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Payload presets" })
    .getByRole("button", { name, exact: true })
    .click();
}

export const fix = (page: Page, name: string | RegExp): Locator =>
  page.getByRole("checkbox", { name });

// Runs the request and waits for its trace. The page is in step mode, so the
// cursor waits on the first event.
export async function run(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(position(page)).toBeVisible();
}

// Runs the request and moves to the end of the trace, where the response and
// the run summary are shown.
export async function runToEnd(page: Page): Promise<void> {
  await run(page);
  await page.getByRole("button", { name: "Last", exact: true }).click();
  await expect(panel(page, "Response").getByText("Total virtual time")).toBeVisible();
}

// A value in the run summary next to the response, e.g. "SQL queries".
export const summaryValue = (page: Page, label: string): Locator =>
  panel(page, "Response")
    .locator("dl.run-summary > div", { has: page.getByText(label, { exact: true }) })
    .locator("dd");

// A row of the comparison table, by its label in the first column.
export const compareRow = (page: Page, label: string): Locator =>
  panel(page, "Compare runs").getByRole("row", { name: new RegExp(`^${label}`) });

// Moves keyboard focus off the Run button, so Space is not a click on it.
export async function blur(page: Page): Promise<void> {
  await page.getByRole("heading", { name: /^Trace \d/ }).click();
}
