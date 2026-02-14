import { test, expect } from "@playwright/test";
import { gotoDashboard, preferTestCredential } from "../helpers/dashboard";

test("open and close symphony detail", async ({ page }) => {
  await gotoDashboard(page);
  await preferTestCredential(page);

  const firstRow = page.locator('[data-testid^="symphony-row-"]').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();

  await expect(page.getByTestId("modal-symphony-detail")).toBeVisible();
  await expect(page.getByText("Live Performance")).toBeVisible();
  await page.getByTestId("btn-close-symphony-detail").click();
  await expect(page.getByTestId("modal-symphony-detail")).toBeHidden();
});
