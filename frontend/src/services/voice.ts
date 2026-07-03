/**
 * Voice service — calls AI Sales Layer (:8000) directly.
 * Step 1: POST /api/v1/voice/sessions → LiveKit token + room name
 * Step 2: WS  /ws/voice → signalling channel
 * Step 3: RTC LiveKit → audio transport (handled by use-voice hook)
 *
 * All auth uses the SINGLE token source from @/lib/token.
 */

import { getAccessToken } from "@/lib/token";

const AI_SALES_BASE = "http://localhost:8000";

export interface VoiceSessionResponse {
  session_id: string;
  conversation_id: string;
  room_name: string;
  livekit_token: string;
  livekit_url: string;
  status: string;
}

export interface VoiceSessionRequest {
  site_id: string;
  business_type?: string;
  agent_name?: string;
}

export const voiceService = {
  async createSession(params: VoiceSessionRequest): Promise<VoiceSessionResponse> {
    const token = getAccessToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${AI_SALES_BASE}/api/v1/voice/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        site_id: params.site_id,
        business_type: params.business_type || "default",
        agent_name: params.agent_name || "Alex",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).detail || `Session create failed: ${res.status}`);
    }
    return res.json();
  },

  async getSession(sessionId: string): Promise<VoiceSessionResponse> {
    const token = getAccessToken();
    const res = await fetch(`${AI_SALES_BASE}/api/v1/voice/sessions/${sessionId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Session status: ${res.status}`);
    return res.json();
  },

  async endSession(sessionId: string): Promise<void> {
    const token = getAccessToken();
    await fetch(`${AI_SALES_BASE}/api/v1/voice/sessions/${sessionId}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  openSignalling(tenantId?: string, userId?: string): WebSocket {
    const jwtToken = getAccessToken();
    const params = new URLSearchParams({ token: jwtToken });
    if (tenantId) params.set("tenant_id", tenantId);
    if (userId) params.set("user_id", userId);
    return new WebSocket(`ws://localhost:8000/ws/voice?${params.toString()}`);
  },
};
