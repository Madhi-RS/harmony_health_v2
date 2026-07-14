/**
 * Voice API service — AI Sales Layer REST calls.
 *
 * Responsibilities:
 * 1. Create / get / end voice sessions
 * 2. Always attach hardcoded Authorization bearer token
 * 3. Normalize backend errors
 * 4. Centralize URL construction
 */

import { getVoiceBaseUrl, getVoiceHeaders, getSiteId } from "@/config/voiceConfig";
import type {
  VoiceSessionResponse,
  VoiceSessionRequest,
} from "@/types/voice";

/** Build a full voice endpoint URL. */
function voiceUrl(path: string): string {
  return `${getVoiceBaseUrl()}${path}`;
}

/** Wrapper that attaches auth headers and normalises errors. */
async function voiceFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = { ...getVoiceHeaders(), ...(init?.headers || {}) };
  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = (body as any).detail || body.message || `Voice API error: ${res.status}`;

    const error = new Error(detail) as Error & { statusCode: number };
    (error as any).statusCode = res.status;
    throw error;
  }

  return res.json();
}

export const voiceApi = {
  /**
   * Create a voice session. Returns LiveKit connection details.
   *
   * IMPORTANT (FE-P0-1): This response contains ONLY room/token/session data
   * (session_id, conversation_id, room_name, livekit_url, livekit_token). It
   * does NOT and will NOT contain conversation transcript text. Do not debug
   * missing transcripts by inspecting this network response.
   *
   * Transcripts flow later, during the active call, through LiveKit
   * data/transcription events (RoomEvent.DataReceived / TranscriptionReceived)
   * handled in livekitVoiceClient.ts → useVoiceSession → VoiceTranscript.
   * Backend publishes: user_interim_transcript, user_final_transcript,
   * assistant_text, stt_error.
   */
  async createSession(
    params: Partial<VoiceSessionRequest> = {}
  ): Promise<VoiceSessionResponse> {
    const body: VoiceSessionRequest = {
      // Pass the resolved site id explicitly (from JWT, else config default) so
      // the voice worker's RAG retrieval has the right tenant/site context.
      site_id: params.site_id ?? getSiteId(),
      business_type: params.business_type ?? "default",
      agent_name: params.agent_name ?? "Alex",
    };

    return voiceFetch<VoiceSessionResponse>(voiceUrl("/sessions"), {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /** Get the status of an existing voice session. */
  async getSession(sessionId: string): Promise<VoiceSessionResponse> {
    return voiceFetch<VoiceSessionResponse>(voiceUrl(`/sessions/${sessionId}`));
  },

  /** End a voice session — cleans up backend resources. */
  async endSession(sessionId: string): Promise<void> {
    await voiceFetch<{ status: string }>(voiceUrl(`/sessions/${sessionId}`), {
      method: "DELETE",
    });
  },

  /** Health check — returns whether the voice service is reachable. */
  async healthCheck(): Promise<{ status: string }> {
    return voiceFetch<{ status: string }>(voiceUrl("/health"));
  },
};
