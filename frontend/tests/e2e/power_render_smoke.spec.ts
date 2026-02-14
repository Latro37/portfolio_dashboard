import { test, expect } from "@playwright/test";
import { gotoDashboard, preferTestCredential } from "../helpers/dashboard";

test("@power renders heavy dashboard and period switching", async ({ page }) => {
  await gotoDashboard(page);
  await preferTestCredential(page);

  const rows = page.locator('[data-testid^="symphony-row-"]');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(5);

  for (const id of ["period-1M", "period-YTD", "period-ALL"]) {
    await page.getByTestId(id).click();
    await expect(page.getByTestId("chart-performance")).toBeVisible();
  }

  // Power profile should have enough transactions to exercise tab pagination.
  await page.getByTestId("tab-transactions").click();
  const pager = page.getByText(/Page \d+ \/ \d+/);
  await expect(pager).toBeVisible();

  const nextButton = page.getByRole("button", { name: "Next" }).first();
  if (await nextButton.isEnabled()) {
    await nextButton.click();
    await expect(page.getByText(/Page 2 \//)).toBeVisible();
  }
});
