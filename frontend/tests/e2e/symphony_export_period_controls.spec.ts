import { test, expect } from "@playwright/test";
import { gotoDashboard, preferTestCredential } from "../helpers/dashboard";

function buildPerformanceSeries(startDate: string, length: number) {
  const baseDate = new Date(`${startDate}T00:00:00`);
  return Array.from({ length }, (_, index) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      portfolio_value: 100000 + index * 500,
      net_deposits: 90000,
      cumulative_return_pct: 10 + index * 0.1,
      daily_return_pct: 0.2,
      time_weighted_return: 5 + index * 0.05,
      money_weighted_return: 5 + index * 0.05,
      current_drawdown: -2,
    };
  });
}

test("period controls keep working while symphony export toast is visible", async ({ page }) => {
  const allPeriodSeries = buildPerformanceSeries("2025-04-07", 40);
  const oneWeekSeries = buildPerformanceSeries("2025-12-24", 6);

  let processed = 11;
  let statusCalls = 0;
  await page.route("**/api/symphony-export/status", async (route) => {
    processed += 1;
    statusCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "running",
        job_id: "e2e-export-job",
        exported: 12,
        processed,
        total: 100,
        message: "running",
        error: null,
      }),
    });
  });

  await page.route("**/api/performance**", async (route) => {
    const url = new URL(route.request().url());
    const period = url.searchParams.get("period");
    const body = period === "1W" ? oneWeekSeries : allPeriodSeries;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await gotoDashboard(page);
  await preferTestCredential(page);

  await expect.poll(() => statusCalls).toBeGreaterThan(1);

  const toast = page.getByText(/Saving Symphonies locally:/);
  await expect(toast).toBeVisible();

  const startDateInput = page.locator('input[type="date"]').first();
  const initialStart = await startDateInput.inputValue();
  expect(initialStart).not.toBe("");

  await page.getByTestId("period-1W").click();

  await expect
    .poll(async () => {
      const value = await startDateInput.inputValue();
      return value !== "" && value !== initialStart;
    }, { timeout: 15_000 })
    .toBeTruthy();

  await page.getByTestId("period-ALL").click();
  await expect
    .poll(async () => startDateInput.inputValue(), { timeout: 15_000 })
    .toBe(initialStart);

  await expect(toast).toBeVisible();
});
