import api from "@/lib/axios";
import type { ChatRequest, ChatResponse, Message } from "@/types/conversation";

export const chatService = {
  /** Send a text message via REST (standard blocking call). */
  async sendMessage(data: ChatRequest): Promise<ChatResponse> {
    const response = await api.post<ChatResponse>("/chat", data);
    return response.data;
  },

  /** Send an audio message (voice recording) to the AI receptionist. */
  async sendAudioMessage(
    conversationId: string,
    audioBlob: Blob,
    transcript?: string
  ): Promise<ChatResponse> {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("conversation_id", conversationId);
    if (transcript) {
      formData.append("transcript", transcript);
    }

    const response = await api.post<ChatResponse>("/chat", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60000,
    });
    return response.data;
  },

  /**
   * Stream chat response via Server-Sent Events.
   * Yields event objects as they arrive: {type, id?, content?}
   */
  async *streamChat(
    data: ChatRequest
  ): AsyncGenerator<{ type: string; id?: string; content?: string; error?: string }> {
    // Harmony login token for SSE stream (NOT CarePlus)
    const token = (() => {
      try {
        const stored = localStorage.getItem("auth-storage");
        if (stored) {
          const parsed = JSON.parse(stored);
          return parsed?.state?.tokens?.access_token || null;
        }
      } catch { return null; }
      return null;
    })();
    const baseURL = api.defaults.baseURL || "http://localhost:8002/api/v1";

    const response = await fetch(`${baseURL}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Stream failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") return;
          try {
            yield JSON.parse(payload);
          } catch {
            // skip unparseable chunks
          }
        }
      }
    }
  },
};

