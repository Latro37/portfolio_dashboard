import { test, expect } from "@playwright/test";
import { gotoDashboard, preferTestCredential } from "../helpers/dashboard";

test("transactions/cashflow tabs and settings modal", async ({ page }) => {
  await gotoDashboard(page);
  await preferTestCredential(page);

  await page.getByTestId("tab-transactions").click();
  await expect(page.getByText("Symbol")).toBeVisible();

  await page.getByTestId("tab-cashflows").click();
  await expect(page.getByText("Non-Trade Activity")).toBeVisible();

  await page.getByTestId("btn-settings").click();
  await expect(page.getByTestId("modal-settings")).toBeVisible();

  // Close by clicking backdrop.
  await page.getByTestId("modal-settings").click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("modal-settings")).toBeHidden();
});

