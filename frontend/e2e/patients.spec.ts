import { test, expect } from "@playwright/test";

test.describe("Patients", () => {
  test("should render patients page after login", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[id="email"]', 'demo@hospital.com');
    await page.fill('input[id="password"]', 'SecurePass123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL("**/dashboard");
    await page.goto("/patients");
    await expect(page.locator("h1")).toContainText("Patients");
  });
});
