import { test, expect } from "@playwright/test";
import { gotoDashboard, preferTestCredential } from "../helpers/dashboard";

test("dashboard loads with header and symphony section", async ({ page }) => {
  await gotoDashboard(page);
  await preferTestCredential(page);

  await expect(page.getByTestId("header-portfolio")).toContainText("Portfolio Value");
  await expect(page.getByTestId("section-symphonies")).toBeVisible();
  await expect(page.getByTestId("chart-performance")).toBeVisible();
});

