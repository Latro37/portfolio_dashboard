import { expect, Page } from "@playwright/test";

export async function gotoDashboard(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("live_enabled", "false");
  });
  await page.goto("/");
  await expect(page.getByTestId("header-portfolio")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("section-symphonies")).toBeVisible({ timeout: 60_000 });
}

export async function stabilizeForSnapshots(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      [data-testid="symphony-last-refreshed"] {
        visibility: hidden !important;
      }
    `,
  });
}

export async function preferTestCredential(page: Page) {
  const cred = page.getByTestId("select-credential");
  if ((await cred.count()) === 0) return;
  const testOption = cred.locator("option[value='__TEST__']");
  if ((await testOption.count()) > 0) {
    await cred.selectOption("__TEST__");
    // Wait for dashboard to refresh after credential switch.
    await expect(page.getByTestId("header-portfolio")).toBeVisible();
  }
}

