import { test, expect } from "@playwright/test";
import { gotoDashboard, preferTestCredential, stabilizeForSnapshots } from "../helpers/dashboard";

test("dashboard header visual regression", async ({ page }) => {
  await gotoDashboard(page);
  await preferTestCredential(page);
  await stabilizeForSnapshots(page);

  await expect(page.getByTestId("header-portfolio")).toHaveScreenshot("dashboard-header.png");
});

