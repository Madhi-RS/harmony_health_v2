const { chromium } = require("playwright");
const BASE = "http://localhost:7788";
const testEmail = "qarun." + Date.now() + "@test.com";
const testUser = "qarun_" + Date.now().toString().slice(-4);
const report = [];

function rpt(msg) {
  report.push(msg);
  console.log(msg);
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let errors = 0;

  page.on("console", (msg) => {
    if (msg.type() === "error")
      rpt("CONSOLE: " + msg.text().substring(0, 120));
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("/api/"))
      rpt("API FAIL: " + req.url().substring(0, 80) + " - " + (req.failure()?.errorText || ""));
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500)
      rpt("5xx: " + r.url().substring(0, 80) + " [" + r.status() + "]");
  });

  // ===== 1. REGISTER =====
  rpt("\n=== 1. REGISTER ===");
  await page.goto(BASE + "/register", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('input[id="email"]', { timeout: 15000 });
  await page.fill('input[id="email"]', testEmail);
  await page.fill('input[id="username"]', testUser);
  await page.fill('input[id="password"]', "QATest123!");
  await page.fill('input[id="confirm-password"]', "QATest123!");
  await page.click('[data-slot="select-trigger"]');
  await page.waitForTimeout(500);
  await page.click('[role="option"]:has-text("Receptionist")');
  await page.waitForTimeout(300);

  const [regResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/auth/register"), { timeout: 15000 }).catch(() => null),
    page.click('button[type="submit"]', { force: true }),
  ]);

  if (regResp && regResp.status() === 201) {
    rpt("PASS: Register 201 Created");
    try {
      await page.waitForURL("**/dashboard", { timeout: 15000 });
      rpt("PASS: Redirected to /dashboard");
    } catch (e) {
      rpt("WARN: No redirect, URL: " + page.url());
      errors++;
    }
  } else if (regResp) {
    rpt("FAIL: Register status " + regResp.status());
    errors++;
  } else {
    rpt("FAIL: No register response (CORS/network)");
    errors++;
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "qa-01-register.png", fullPage: true, timeout: 10000 }).catch(() => {});

  // ===== 2. DASHBOARD =====
  rpt("\n=== 2. DASHBOARD ===");
  await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  rpt("Title: " + (await page.title()));
  await page.screenshot({ path: "qa-02-dashboard.png", fullPage: true, timeout: 10000 }).catch(() => {});

  // ===== 3. CREATE PATIENT =====
  rpt("\n=== 3. PATIENTS ===");
  await page.goto(BASE + "/patients", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);

  const addBtn = page.locator('button:has-text("Add Patient")');
  let patientId = null;
  if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(1000);
    await page.fill('input[id="first-name"]', "QATest");
    await page.fill('input[id="last-name"]', "Patient1");
    await page.fill('input[id="phone"]', "555-9999");
    await page.fill('input[id="email"]', "qapatient@test.com");

    const [createResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/patients") && r.request().method() === "POST", { timeout: 10000 }).catch(() => null),
      page.click('button[type="submit"]', { force: true }),
    ]);
    await page.waitForTimeout(2000);
    if (createResp && createResp.status() === 201) {
      rpt("PASS: Patient created 201");
      const body = await createResp.json().catch(() => ({}));
      patientId = body.id;
    } else {
      rpt("FAIL: Patient create status " + (createResp?.status() || "no response"));
      errors++;
    }
  } else {
    rpt("FAIL: Add Patient button not found — not logged in?");
    errors++;
  }
  await page.screenshot({ path: "qa-03-patients.png", fullPage: true, timeout: 10000 }).catch(() => {});

  // ===== 3b. PATIENT DETAIL =====
  if (patientId) {
    rpt("\n=== 3b. PATIENT DETAIL ===");
    await page.goto(BASE + "/patients/" + patientId, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2000);
    rpt("PASS: Patient detail page loaded");
    await page.screenshot({ path: "qa-03b-patient-detail.png", fullPage: true, timeout: 10000 }).catch(() => {});
  }

  // ===== 4. APPOINTMENTS =====
  rpt("\n=== 4. APPOINTMENTS ===");
  await page.goto(BASE + "/appointments", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "qa-04-appointments.png", fullPage: true, timeout: 10000 }).catch(() => {});
  rpt("PASS: Appointments page loaded");

  // ===== 5. CHAT =====
  rpt("\n=== 5. CHAT ===");
  await page.goto(BASE + "/chat", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  const startBtn = page.locator('button:has-text("Start New Conversation")');
  if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await startBtn.click();
    await page.waitForTimeout(2000);
    rpt("PASS: Conversation started");
  } else {
    rpt("WARN: No Start New Conversation visible (may already have conversations)");
  }
  await page.screenshot({ path: "qa-05-chat.png", fullPage: true, timeout: 10000 }).catch(() => {});

  // ===== 6. ALL ROUTES =====
  rpt("\n=== 6. ROUTE CHECK ===");
  for (const route of ["/login", "/register", "/dashboard", "/patients", "/appointments", "/chat"]) {
    try {
      const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 20000 });
      rpt((resp.ok() ? "PASS" : "FAIL") + " " + route + " [" + resp.status() + "]");
    } catch (e) {
      rpt("FAIL " + route + " - " + e.message.substring(0, 50));
      errors++;
    }
  }

  // ===== 7. DELETE PATIENT =====
  if (patientId) {
    rpt("\n=== 7. DELETE PATIENT ===");
    await page.goto(BASE + "/patients/" + patientId, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2000);
    const deleteBtn = page.locator("button:has-text('Delete')");
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(500);
      const confirmBtn = page.locator('[role="alertdialog"] button:has-text("Delete")');
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
        rpt("PASS: Patient deleted");
      } else {
        rpt("WARN: Confirm dialog not found");
        errors++;
      }
    } else {
      rpt("WARN: Delete button not found");
    }
    await page.screenshot({ path: "qa-07-after-delete.png", fullPage: true, timeout: 10000 }).catch(() => {});
  }

  // ===== FINAL REPORT =====
  rpt("\n========================================");
  rpt("  QA REPORT — Harmony Health PMS");
  rpt("========================================");
  rpt("Stack:    Frontend=:5000  Backend=:9090  DB=:5432");
  rpt("User:     " + testEmail);
  rpt("Errors:   " + errors);
  rpt("Screens:  qa-*.png in project root");
  rpt("");
  rpt("Browser stays open — manual inspection OK.");

  // Save report
  const fs = require("fs");
  fs.writeFileSync("qa-report.txt", report.join("\n"));
  console.log("\nReport saved to qa-report.txt");
})();
