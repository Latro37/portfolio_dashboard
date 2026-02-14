import { test, expect } from "@playwright/test";
import { gotoDashboard, preferTestCredential, stabilizeForSnapshots } from "../helpers/dashboard";

test("performance chart visual regression", async ({ page }) => {
  await gotoDashboard(page);
  await preferTestCredential(page);
  await stabilizeForSnapshots(page);

  await expect(page.getByTestId("chart-performance")).toHaveScreenshot("performance-chart.png");
});

