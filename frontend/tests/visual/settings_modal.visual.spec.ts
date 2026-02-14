import { test, expect } from "@playwright/test";
import { gotoDashboard, preferTestCredential, stabilizeForSnapshots } from "../helpers/dashboard";

test("settings modal visual regression", async ({ page }) => {
  await gotoDashboard(page);
  await preferTestCredential(page);
  await page.getByTestId("btn-settings").click();
  await expect(page.getByTestId("modal-settings")).toBeVisible();
  await stabilizeForSnapshots(page);

  const modalPanel = page.getByTestId("modal-settings").locator("div").first();
  await expect(modalPanel).toHaveScreenshot("settings-modal.png");
});

