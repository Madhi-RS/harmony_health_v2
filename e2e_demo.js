const { chromium } = require("playwright");
const BASE = "http://localhost:4000";

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  console.log("✅ Chromium launched — you should see a browser window now");

  // 1. Login
  console.log("📂 Going to login page...");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('input[id="email"]', { timeout: 15000 });
  console.log("✅ Login page visible");
  await page.screenshot({ path: "screenshot-01-login.png", fullPage: true });

  // 2. Fill and submit
  await page.fill('input[id="email"]', "demo@hospital.com");
  await page.fill('input[id="password"]', "SecurePass123!");
  await page.click('button:has-text("Sign In")', { force: true });
  console.log("✅ Submitted login");

  // 3. Wait for prompt section
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  await page.waitForTimeout(1000);
  console.log("✅ Dashboard loaded");
  await page.screenshot({ path: "screenshot-02-dashboard.png", fullPage: true });

  // 4. Patients
  await page.goto(`${BASE}/patients`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1500);
  console.log("✅ Patients page");
  await page.screenshot({ path: "screenshot-03-patients.png", fullPage: true });

  // 5. Appointments
  await page.goto(`${BASE}/appointments`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1500);
  console.log("✅ Appointments page");
  await page.screenshot({ path: "screenshot-04-appointments.png", fullPage: true });

  // 6. Chat
  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1500);
  console.log("✅ Chat page");
  await page.screenshot({ path: "screenshot-05-chat.png", fullPage: true });

  // 7. Back to dashboard
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1000);

  console.log("🎉 All done! You're now logged in on the Dashboard.");
  console.log("📷 Screenshots saved to the project folder.");
  console.log("🌐 Browser stays open — explore the app!");
})();
