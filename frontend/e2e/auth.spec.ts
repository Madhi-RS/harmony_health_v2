import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should show login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toContainText("Harmony Health");
  });

  test("should show register page", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("h1")).toContainText("Harmony Health");
  });
});
