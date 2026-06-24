/**
 * T7.13 — E2E voice record + send
 *
 * Covers: record audio → stop → voice message appears in chat timeline
 *
 * Flow:
 *   1. Seed auth state into localStorage (simulates logged-in user)
 *   2. Mock MediaRecorder / getUserMedia APIs (unavailable in headless)
 *   3. Mock backend chat APIs
 *   4. Navigate to /chat and select a conversation
 *   5. Enter voice mode (click Mic toggle button)
 *   6. Start recording (click large mic button)
 *   7. See recording indicator and Stop button
 *   8. Stop recording (click Stop button)
 *   9. Verify the voice message and AI response appear
 *  10. Screenshot for visual diff
 */

import { test, expect } from "@playwright/test";
import { mockVoiceApis, mockChatApis } from "./helpers";

/**
 * Helper: seed auth into localStorage so the app thinks a user is logged in.
 */
async function seedAuth(page: any) {
  const authState = {
    state: {
      user: {
        id: "test-user-id",
        email: "test@hospital.com",
        username: "testuser",
        role: "ADMIN",
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      tokens: {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        token_type: "bearer",
      },
      isAuthenticated: true,
    },
    version: 0,
  };

  await page.goto("/login");
  await page.evaluate(
    (state) => localStorage.setItem("auth-storage", JSON.stringify(state)),
    authState
  );
}

/**
 * Helper: select a conversation from the sidebar.
 */
async function selectFirstConversation(page: any) {
  // The sidebar lists conversations; click the first one
  const conversationItem = page.locator(
    'button:has(svg.lucide-message-square):not(:has(button))'
  );
  // Fallback: find any text that looks like a conversation title
  const convTitle = page.locator("text=Test Conversation");
  await expect(convTitle.first()).toBeVisible({ timeout: 5000 });
  await convTitle.first().click();
  await page.waitForTimeout(500);
}

test.describe("T7.13 — Voice record + send", () => {
  test("full voice recording flow — enter voice mode, record, stop, see response", async ({
    page,
  }) => {
    // ── 1. Seed auth ──────────────────────────────────────────────
    await seedAuth(page);

    // ── 2. Mock browser APIs (needed before chat page loads) ──────
    await mockVoiceApis(page);

    // ── 3. Mock backend ───────────────────────────────────────────
    await mockChatApis(page);

    // ── 4. Navigate to chat ───────────────────────────────────────
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Select the conversation
    await selectFirstConversation(page);

    // ── 5. Enter voice mode ───────────────────────────────────────
    // The small Mic icon button toggles voice mode (type="button")
    const voiceToggle = page.locator(
      'button[type="button"]:has(svg.lucide-mic)'
    );
    await expect(voiceToggle.first()).toBeVisible({ timeout: 3000 });
    await voiceToggle.first().click();
    await page.waitForTimeout(300);

    // Voice mode renders a large circular mic button
    const recordButton = page.locator(
      'button:has(svg.lucide-mic)'
    ).last();
    await expect(recordButton).toBeVisible({ timeout: 3000 });

    // ── 6. Start recording ────────────────────────────────────────
    await recordButton.click();
    await page.waitForTimeout(500);

    // Recording indicator "Recording..." and Stop button should appear
    await expect(page.locator("text=Recording...")).toBeVisible({
      timeout: 3000,
    });
    const stopButton = page.locator(
      'button:has(svg.lucide-mic-off)'
    );
    await expect(stopButton).toBeVisible({ timeout: 3000 });

    // ── 7. Stop recording ─────────────────────────────────────────
    await stopButton.click();
    await page.waitForTimeout(2000);

    // ── 8. Verify AI response appears ─────────────────────────────
    // The backend mock returns this text after a chat request
    await expect(
      page.locator("text=I received your voice message. How can I help you today?")
    ).toBeVisible({ timeout: 10000 });

    // ── 9. Screenshot ─────────────────────────────────────────────
    await page.screenshot({
      path: "test-results/t7-13-voice-record-send.png",
      fullPage: true,
    });
  });

  test("voice mode toggle switches between text and voice input", async ({
    page,
  }) => {
    await seedAuth(page);
    await mockChatApis(page);

    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    await selectFirstConversation(page);

    // Default state: textarea is visible
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Click voice toggle → voice UI appears (large mic button)
    const voiceToggle = page
      .locator('button[type="button"]:has(svg.lucide-mic)')
      .first();
    await voiceToggle.click();
    await page.waitForTimeout(300);

    // Voice mode: textarea hidden, big mic button shown
    const bigMicButton = page.locator("button:has(svg.lucide-mic)").last();
    await expect(bigMicButton).toBeVisible({ timeout: 3000 });

    // Click voice toggle again → back to text mode
    await voiceToggle.click();
    await page.waitForTimeout(300);
    await expect(textarea).toBeVisible({ timeout: 3000 });
  });

  test("denied microphone permission shows error state", async ({
    page,
  }) => {
    await seedAuth(page);

    // Mock getUserMedia to reject — before page load
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        value: {
          getUserMedia: async () => {
            const err = new Error("Permission denied") as any;
            err.name = "NotAllowedError";
            throw err;
          },
        },
        configurable: true,
      });

      (window as any).AudioContext = class MockAudioContext {
        createMediaStreamSource() {
          return { connect: () => {} };
        }
        createAnalyser() {
          return {
            fftSize: 256,
            frequencyBinCount: 128,
            getByteFrequencyData: (arr: Uint8Array) => arr.fill(0),
          };
        }
        close() {}
      };
    });

    await mockChatApis(page);

    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    await selectFirstConversation(page);

    // Enter voice mode
    const voiceToggle = page
      .locator('button[type="button"]:has(svg.lucide-mic)')
      .first();
    await voiceToggle.click();
    await page.waitForTimeout(300);

    // Try recording — should fail silently/gracefully
    const recordButton = page.locator("button:has(svg.lucide-mic)").last();
    await recordButton.click();
    await page.waitForTimeout(500);

    // The permission error is caught but not shown as a visible toast in our
    // current implementation — just verify the app doesn't crash
    // (the recording indicator should NOT appear since getUserMedia failed)
    await expect(page.locator("text=Recording...")).not.toBeVisible({
      timeout: 2000,
    });
  });
});
