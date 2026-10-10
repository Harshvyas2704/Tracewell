import { expect, test } from "@playwright/test";
import { compareRow, fix, openScenario, panel, runToEnd, summaryValue } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openScenario(page, "Orders: N+1 queries");
});

test("the N+1 loop: 51 queries, turn on eager loading, 2 queries, compare", async ({ page }) => {
  await runToEnd(page);
  await expect(summaryValue(page, "SQL queries")).toHaveText("51");
  await expect(
    panel(page, "Trace").getByRole("button", { name: /50× SELECT order_items/ }),
  ).toBeVisible();
  // One run is not a comparison yet.
  await expect(panel(page, "Compare runs").getByRole("table")).toHaveCount(0);

  await fix(page, /Eager load items/).check();
  await expect(page.getByText(/Changed since the run on screen/)).toBeVisible();
  await runToEnd(page);
  await expect(summaryValue(page, "SQL queries")).toHaveText("2");
  await expect(panel(page, "Code")).toContainText("WHERE order_id IN (");

  const queries = compareRow(page, "SQL queries").getByRole("cell");
  await expect(queries).toHaveText(["51", "2", "−49 (−96%)"]);
  await expect(compareRow(page, "Rows returned").getByRole("cell")).toHaveText(["249", "249", "same"]);
  await expect(compareRow(page, "Status").getByRole("cell")).toHaveText(["200 OK", "200 OK", "same"]);
  await expect(panel(page, "Compare runs")).toContainText(
    "Fixes that differ: Eager load items (A off, B on)",
  );
});

test("with the index on, an item query is an Index Scan", async ({ page }) => {
  await fix(page, /Index order_items\.order_id/).check();
  await runToEnd(page);
  await expect(summaryValue(page, "SQL queries")).toHaveText("51");
  await expect(panel(page, "Code")).toContainText("CREATE INDEX order_items_order_id_idx");

  // Clicking the collapsed group moves to its last item query.
  await panel(page, "Trace").getByRole("button", { name: /50× SELECT order_items/ }).click();
  const inspector = panel(page, "Inspector");
  await expect(inspector).toContainText("Index Scan using index on order_id");
  // The breakdown shows the round trip is nearly all of the cost.
  await expect(inspector.getByRole("row", { name: /^Round trip/ })).toContainText("1.000 ms");
  await expect(inspector.getByRole("row", { name: /^Total/ })).toContainText(/1\.1\d\d ms/);
});

test("without the index, an item query is a Seq Scan over the whole table", async ({ page }) => {
  await runToEnd(page);
  await panel(page, "Trace").getByRole("button", { name: /50× SELECT order_items/ }).click();
  const inspector = panel(page, "Inspector");
  await expect(inspector).toContainText("Seq Scan");
  await expect(inspector.getByRole("row", { name: /^Rows scanned/ }).getByRole("cell")).toHaveText([
    "4,000 x 0.005 =",
    "20.000 ms",
  ]);
});

test("the previous run is kept automatically, and pinning locks A", async ({ page }) => {
  const compare = panel(page, "Compare runs");
  const time = compareRow(page, "Total time").getByRole("cell");

  // Two runs without pinning give a comparison.
  await runToEnd(page);
  await fix(page, /Eager load items/).check();
  await runToEnd(page);
  await expect(compare.getByRole("columnheader", { name: "A (previous run)" })).toBeVisible();
  await expect(time.nth(0)).toHaveText("1059.083 ms");
  await expect(time.nth(1)).toHaveText("30.083 ms");

  // Pin A, then run twice more with different fixes: A does not move.
  await compare.getByRole("button", { name: "Pin A" }).click();
  await expect(compare.getByRole("columnheader", { name: "A (pinned run)" })).toBeVisible();

  await fix(page, /Index order_items\.order_id/).check();
  await runToEnd(page);
  await expect(time.nth(0)).toHaveText("1059.083 ms");
  await expect(time.nth(1)).toHaveText("14.078 ms");

  await fix(page, /Eager load items/).uncheck();
  await runToEnd(page);
  await expect(time.nth(0)).toHaveText("1059.083 ms");
  await expect(time.nth(1)).toHaveText("63.078 ms");
  await expect(compare).toContainText("Index order_items.order_id (A off, B on)");

  // Unpin: the next run moves B to A again.
  await compare.getByRole("button", { name: "Unpin A" }).click();
  await runToEnd(page);
  await expect(compare.getByRole("columnheader", { name: "A (previous run)" })).toBeVisible();
  await expect(time.nth(0)).toHaveText("63.078 ms");
});

test("the Why section explains the scenario", async ({ page }) => {
  const why = page.getByText("Why", { exact: true });
  await expect(page.getByText(/N\+1 means one query to load a list/)).toBeHidden();
  await why.click();
  await expect(page.getByText(/N\+1 means one query to load a list/)).toBeVisible();
  await expect(page.locator(".why code", { hasText: "order.items" })).toBeVisible();
});
