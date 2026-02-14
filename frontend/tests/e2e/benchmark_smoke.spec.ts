import { test, expect } from "@playwright/test";
import { gotoDashboard, preferTestCredential } from "../helpers/dashboard";

test("add and remove SPY benchmark", async ({ page }) => {
  await gotoDashboard(page);
  await preferTestCredential(page);

  await page.getByRole("button", { name: "TWR" }).click();
  const spyButton = page.getByTestId("benchmark-SPY");
  await expect(spyButton).toBeVisible();

  if ((await spyButton.getAttribute("data-active")) !== "true") {
    await spyButton.click();
  }
  await expect(spyButton).toHaveAttribute("data-active", "true");

  await spyButton.click();
  await expect(spyButton).toHaveAttribute("data-active", "false");
});
