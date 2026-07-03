const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    permissions: ["microphone"],  // grant mic permission
  });
  const page = await context.newPage();
  const BASE = "http://localhost:3000";

  // Capture all console logs + network requests
  const events = [];
  page.on("console", (msg) => {
    if (msg.text().includes("[Voice]") || msg.text().includes("[MIC]"))
      events.push("CONSOLE: " + msg.text());
  });
  page.on("request", (req) => {
    if (req.url().includes("/voice/")) events.push("REQUEST: " + req.method() + " " + req.url());
  });
  page.on("response", (res) => {
    if (res.url().includes("/voice/")) events.push("RESPONSE: " + res.status() + " " + res.url());
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("/voice/")) events.push("FAILED: " + req.url() + " - " + (req.failure()?.errorText || ""));
  });

  // Register + login
  const email = "voice-qa-" + Date.now() + "@test.com";
  console.log("1. Registering user...");
  await page.goto(BASE + "/register", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2000);
  try {
    await page.waitForSelector('input[id="email"]', { timeout: 15000 });
    await page.fill('input[id="email"]', email);
    await page.fill('input[id="username"]', "voice_qa_" + Date.now().toString().slice(-4));
    await page.fill('input[id="password"]', "QAPass123!");
    await page.fill('input[id="confirm-password"]', "QAPass123!");
    await page.click('[data-slot="select-trigger"]', { force: true });
    await page.waitForTimeout(500);
    await page.click('[role="option"]:has-text("Admin")', { force: true });
    await page.click('button[type="submit"]', { force: true });
    await page.waitForTimeout(5000);
    console.log("   Registered: " + page.url().includes("dashboard"));
  } catch (e) {
    console.log("   Register failed, trying login...");
    await page.goto(BASE + "/login", { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.waitForSelector('input[id="email"]', { timeout: 15000 });
    await page.fill('input[id="email"]', "admin@harmony.health");
    await page.fill('input[id="password"]', "AdminPass123!");
    await page.click('button:has-text("Sign In")', { force: true });
    await page.waitForTimeout(5000);
  }

  // Go to chat
  console.log("2. Navigating to chat...");
  await page.goto(BASE + "/chat", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Start conversation
  const startBtn = page.locator('button:has-text("Start New Conversation")');
  if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await startBtn.click({ force: true });
    await page.waitForTimeout(2000);
    console.log("   Conversation started");
  }

  // Click the mic button
  console.log("3. Clicking microphone...");
  const micBtn = page.locator('button:has-text("") svg.lucide-mic').first();
  // Or find by icon
  const allBtns = page.locator("button");
  const count = await allBtns.count();
  let micClicked = false;
  for (let i = 0; i < count; i++) {
    const btn = allBtns.nth(i);
    const html = await btn.innerHTML().catch(() => "");
    if (html.includes("lucide-mic") || html.includes("lucide-mic-off")) {
      console.log("   Found mic button at index " + i);
      try {
        await btn.click({ force: true, timeout: 5000 });
        micClicked = true;
      } catch (e) {
        console.log("   Mic click failed: " + e.message);
      }
      break;
    }
  }

  if (!micClicked) {
    console.log("   No mic button found — checking page state...");
    const ta = page.locator("textarea");
    const taVisible = await ta.isVisible().catch(() => false);
    console.log("   Textarea visible: " + taVisible);
  }

  // Wait for voice events
  console.log("4. Waiting for voice session request...");
  await page.waitForTimeout(5000);

  // Print all voice events
  console.log("\n══════ VOICE TRACE ══════");
  events.forEach((e) => console.log("  " + e));
  if (events.length === 0) console.log("  (no voice events captured)");

  // Take screenshot
  await page.screenshot({ path: "voice-test.png", fullPage: true });
  console.log("\nScreenshot: voice-test.png");
  console.log("Browser open — inspect chat page");
})();
