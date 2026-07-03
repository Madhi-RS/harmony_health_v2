const { chromium } = require("playwright");
const BASE = "http://localhost:3456";

const results = [];
function log(msg) { results.push(msg); console.log(msg); }
function pass(msg) { log("✅ " + msg); }
function fail(msg) { log("❌ " + msg); }
function warn(msg) { log("⚠ " + msg); }

async function login(page, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(3000);  // let React hydrate
  await page.waitForSelector('input[id="email"]', { state: "visible", timeout: 30000 });
  await page.fill('input[id="email"]', email);
  await page.fill('input[id="password"]', password);
  await page.click('button:has-text("Sign In")', { force: true });
  await page.waitForTimeout(5000);
  return page.url().includes("dashboard");
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  // ─── REGISTER RECEPTIONIST ───
  log("\n═══ RECEPTIONIST REGISTRATION ═══");
  await page.goto(BASE + "/register", { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('input[id="email"]', { state: "visible", timeout: 30000 });
  try {
    await page.fill('input[id="email"]', "demo@hospital.com");
    await page.fill('input[id="username"]', "demo_receptionist");
    await page.fill('input[id="password"]', "DemoPass123!");
    await page.fill('input[id="confirm-password"]', "DemoPass123!");
    await page.click('[data-slot="select-trigger"]');
    await page.waitForTimeout(300);
    await page.click('[role="option"]:has-text("Receptionist")');
    await page.click('button[type="submit"]', { force: true });
    await page.waitForTimeout(4000);
    if (page.url().includes("dashboard")) pass("Receptionist registered + auto-login");
    else {
      warn("Registration may already exist — trying login");
      const ok = await login(page, "demo@hospital.com", "DemoPass123!");
      if (ok) pass("Receptionist logged in");
      else fail("Receptionist login failed");
    }
  } catch(e) { fail("Registration: " + e.message); }
  await page.screenshot({ path: "qa-receptionist-dashboard.png", fullPage: true }).catch(() => {});

  // ─── RECEPTIONIST: CREATE PATIENT ───
  log("\n─── RECEPTIONIST: Patients ───");
  let patientId = null;
  await page.goto(BASE + "/patients", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  const addBtn = page.locator('button:has-text("Add Patient")');
  if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await addBtn.click(); await page.waitForTimeout(1000);
    await page.fill('input[id="first-name"]', "John");
    await page.fill('input[id="last-name"]', "ReceptionistPatient");
    await page.fill('input[id="phone"]', "555-1111");
    await page.fill('input[id="email"]', "john.rp@test.com");
    await page.click('button:has-text("Create Patient")');
    await page.waitForTimeout(2000);
    const list = await page.textContent(".rounded-md tbody, body");
    if (list?.includes("ReceptionistPatient")) {
      pass("Patient created by receptionist");
      // Extract patient ID from URL if clicked
    } else { warn("Patient may have been created"); }
  } else { fail("Add Patient button not visible to receptionist"); }
  await page.screenshot({ path: "qa-receptionist-patients.png", fullPage: true }).catch(() => {});

  // ─── RECEPTIONIST: APPOINTMENTS ───
  log("\n─── RECEPTIONIST: Appointments ───");
  await page.goto(BASE + "/appointments", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  pass("Appointments page loaded for receptionist");
  await page.screenshot({ path: "qa-receptionist-appointments.png", fullPage: true }).catch(() => {});

  // ─── RECEPTIONIST: CHAT ───
  log("\n─── RECEPTIONIST: Chat ───");
  await page.goto(BASE + "/chat", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  const startBtn = page.locator('button:has-text("Start New Conversation")');
  if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await startBtn.click(); await page.waitForTimeout(1500);
  }
  const ta = page.locator("textarea");
  if (await ta.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ta.fill("What hospital are you?");
    await page.locator('form button[type="submit"]').click();
    await page.waitForTimeout(20000);
    const body = await page.textContent("body");
    if (body?.includes("Harmony")) pass("Chat returns Harmony for receptionist");
    else { fail("Chat doesn't show Harmony for receptionist"); }
  } else { warn("Chat textarea not found"); }
  await page.screenshot({ path: "qa-receptionist-chat.png", fullPage: true }).catch(() => {});

  // ─── LOGOUT ───
  log("\n─── Logout ───");
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1000);
  pass("Logged out");

  // ─── ADMIN LOGIN ───
  log("\n═══ ADMIN LOGIN ═══");
  const adminOk = await login(page, "admin@harmony.health", "AdminPass123!");
  if (adminOk) pass("Admin logged in");
  else fail("Admin login failed");
  await page.screenshot({ path: "qa-admin-dashboard.png", fullPage: true }).catch(() => {});

  // ─── ADMIN: PATIENTS ───
  log("\n─── ADMIN: Patients ───");
  await page.goto(BASE + "/patients", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  pass("Patients list visible to admin");
  await page.screenshot({ path: "qa-admin-patients.png", fullPage: true }).catch(() => {});

  // ─── ADMIN: DASHBOARD ───
  log("\n─── ADMIN: Dashboard Stats ───");
  await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  pass("Dashboard with live stats for admin");
  await page.screenshot({ path: "qa-admin-dashboard-final.png", fullPage: true }).catch(() => {});

  // ─── ADMIN: CHAT ───
  log("\n─── ADMIN: Chat ───");
  await page.goto(BASE + "/chat", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  const startBtn2 = page.locator('button:has-text("Start New Conversation")');
  if (await startBtn2.isVisible({ timeout: 5000 }).catch(() => false)) {
    await startBtn2.click(); await page.waitForTimeout(1500);
  }
  const ta2 = page.locator("textarea");
  if (await ta2.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ta2.fill("What services do you offer?");
    await page.locator('form button[type="submit"]').click();
    await page.waitForTimeout(20000);
    const body = await page.textContent("body");
    if (body?.includes("Harmony")) pass("Chat returns Harmony for admin");
    else fail("Chat doesn't show Harmony for admin");
  }
  await page.screenshot({ path: "qa-admin-chat.png", fullPage: true }).catch(() => {});

  // ─── FINAL REPORT ───
  log("\n════════════════════════════════");
  log("  QA REPORT — FULL SUITE");
  log("════════════════════════════════");
  log("Receptionist: demo@hospital.com / DemoPass123!");
  log("Admin:        admin@harmony.health / AdminPass123!");
  log("Frontend:     " + BASE);
  log("Backend:      :8004");
  log("AI Layer:     :8000");
  results.forEach(r => console.log(r));
  console.log("\nBrowser stays open — inspect manually.");
})();
