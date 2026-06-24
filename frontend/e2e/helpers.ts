import { Page } from "@playwright/test";

/**
 * Mock browser APIs required for voice recording tests.
 * `getUserMedia` and `MediaRecorder` are not available in headless Chromium.
 */
export async function mockVoiceApis(page: Page) {
  await page.addInitScript(() => {
    // Mock getUserMedia — returns a fake MediaStream
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => {
          const stream = new MediaStream();
          const audioTrack = new (window as any).MediaStreamTrack();
          stream.addTrack(audioTrack);
          return stream;
        },
      },
      configurable: true,
    });

    // Mock AudioContext for level analysis
    (window as any).AudioContext = class MockAudioContext {
      createMediaStreamSource() {
        return {
          connect: () => {},
        };
      }
      createAnalyser() {
        return {
          fftSize: 256,
          frequencyBinCount: 128,
          getByteFrequencyData: (arr: Uint8Array) => {
            arr.fill(64); // Simulate mid-level audio
          },
        };
      }
      close() {}
    };

    // Mock MediaRecorder
    const originalMediaRecorder = (window as any).MediaRecorder;

    (window as any).MediaRecorder = class MockMediaRecorder {
      state: string = "inactive";
      mimeType: string = "audio/webm";
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;

      constructor(_stream: MediaStream, _options?: any) {
        this.state = "inactive";
      }

      start(_timeslice?: number) {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        // Simulate audio data
        if (this.ondataavailable) {
          this.ondataavailable({
            data: new Blob(["fake-audio-data"], { type: "audio/webm" }),
          });
        }
        if (this.onstop) {
          this.onstop();
        }
      }

      static isTypeSupported(type: string) {
        return type === "audio/webm";
      }
    };

    // Mock MediaStreamTrack
    if (!(window as any).MediaStreamTrack) {
      (window as any).MediaStreamTrack = class MockMediaStreamTrack {
        stop() {}
      };
    }
  });
}

/**
 * Mock backend API responses for chat flow.
 */
export async function mockChatApis(page: Page) {
  // Mock conversation creation
  await page.route("**/api/v1/conversations", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-conv-001",
          title: "New Conversation",
          user_id: "test-user-id",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
    } else {
      // GET conversations list
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "test-conv-001",
            title: "Test Conversation",
            user_id: "test-user-id",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    }
  });

  // Mock messages endpoint
  await page.route("**/api/v1/conversations/*/messages", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock chat endpoint
  await page.route("**/api/v1/chat", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: {
            id: "test-msg-002",
            conversation_id: "test-conv-001",
            role: "ASSISTANT",
            content: "I received your voice message. How can I help you today?",
            message_type: "TEXT",
            audio_url: null,
            created_at: new Date().toISOString(),
          },
          conversation: {
            id: "test-conv-001",
            title: "Test Conversation",
            user_id: "test-user-id",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }),
      });
    }
  });

  // Mock auth register for login flow
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        user: {
          id: "test-user-id",
          email: "test@hospital.com",
          username: "testuser",
          role: "ADMIN",
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }),
    });
  });
}
