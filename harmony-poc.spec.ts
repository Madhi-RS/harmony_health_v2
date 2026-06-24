// harmony-poc.spec.ts
import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8000/api/v1";
const TENANT_ID = "a7e2f8b1-9c44-4d3a-b6a7-5f2e8c1d9a33";
const SITE_ID = "c2b1f7d9-6a11-4e8b-9d2c-4a7e5f1c8b21";

test("RAG retrieves Harmony General Hospital content", async ({ request }) => {
  test.setTimeout(120_000);  // Gemini can take 30-60s
  // Step 1: Initialize session
  const initRes = await request.post(`${API_BASE}/session/init`, {
    data: {
      tenant_id: TENANT_ID,
      tenant_user_id: "poc-test-user",
      site_id: SITE_ID,
    },
  });
  expect(initRes.ok()).toBeTruthy();
  const initBody = await initRes.json();
  const sessionId = initBody.session_id;
  console.log(`Session: ${sessionId}`);

  // Step 2: Send chat query (tenant mapping fixed — uses Harmony Qdrant collection)
  const chatRes = await request.post(`${API_BASE}/chat`, {
    headers: { "X-Session-ID": sessionId },
    data: {
      site_id: SITE_ID,
      message: "What is the name of this hospital? What services do you offer?",
      conversation_history: [],
    },
  });
  expect(chatRes.ok()).toBeTruthy();
  const body = await chatRes.json();

  // AI Sales Layer wraps response in { chat: { response, context_items } }
  const chatData = body.chat || {};
  const responseText: string = chatData.response || "";
  const contextItems: any[] = chatData.context_items || [];

  console.log(`\nLLM Response:\n${responseText}\n`);

  // ── Harmony indicators ──
  expect(responseText).toMatch(/Harmony/i);
  expect(responseText).toMatch(/hospital/i);

  // ── Must NOT hallucinate Care Plus ──
  expect(responseText).not.toMatch(/Care\s*Plus/i);

  // ── Context check — RAG sources must be non-empty ──
  const sources = contextItems.map(
    (c: any) => c.metadata?.source_identity_id || c.id
  );
  console.log("RAG sources:", sources);
  expect(contextItems.length).toBeGreaterThan(0);

  // ── Every context item must belong to Harmony's internal tenant ──
  // The AI service maps external tenant_id -> internal tenant_id
  // We verify all results share the same internal tenant
  const internalTenants = new Set(
    contextItems.map((c: any) => c.metadata?.tenant_id)
  );
  console.log("Internal tenants:", [...internalTenants]);
  expect(internalTenants.size).toBe(1);

  console.log("\n✅ PASS — Harmony General Hospital RAG retrieval verified");
});
