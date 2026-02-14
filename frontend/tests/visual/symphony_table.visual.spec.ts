import { test, expect } from "@playwright/test";
import { gotoDashboard, preferTestCredential, stabilizeForSnapshots } from "../helpers/dashboard";

test("symphony table visual regression", async ({ page }) => {
  await gotoDashboard(page);
  await preferTestCredential(page);
  await stabilizeForSnapshots(page);

  await expect(page.getByTestId("symphony-table")).toHaveScreenshot("symphony-table.png");
});

