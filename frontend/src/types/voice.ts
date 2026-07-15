/** Voice UI lifecycle states exposed to components. */
export type VoiceUiState =
  | "idle"
  | "creating_session"
  | "connecting_livekit"
  | "connected"
  | "listening"
  | "assistant_speaking"
  | "reconnecting"
  | "ending"
  | "ended"
  | "error";

/** Response from POST /api/v1/voice/sessions */
export interface VoiceSessionResponse {
  session_id: string;
  conversation_id: string;
  room_name: string;
  livekit_token: string;
  livekit_url: string;
  status: string;
}

/** Request body for POST /api/v1/voice/sessions */
export interface VoiceSessionRequest {
  site_id: string | null;
  business_type: string;
  agent_name: string;
}

/** LiveKit connection details extracted from the session response. */
export interface LiveKitConnection {
  livekitUrl: string;
  livekitToken: string;
  roomName: string;
}

/** Session info preserved across the voice call lifetime. */
export interface VoiceSession {
  sessionId: string;
  conversationId: string;
  roomName: string;
}

/** Error with optional HTTP status code for differentiated UX. */
export interface VoiceError {
  message: string;
  statusCode?: number;
  recoverable: boolean;
}

/** A single transcript line rendered in the voice panel. */
export interface VoiceTranscriptItem {
  id: string;
  role: "user" | "assistant";
  text: string;
  isFinal: boolean;
  timestamp: number;
}

/**
 * Data-channel event payloads published by the backend over LiveKit.
 *
 * NOTE: These do NOT come from POST /api/v1/voice/sessions. That REST call only
 * returns room/token/session. Transcript text arrives later through LiveKit
 * data/transcription events during the active call.
 *
 * `segmentId` is the LiveKit segment id (when available) used for stable
 * unique React keys and upsert-based deduplication (Frontend Fix B).
 */
export type VoiceDataEvent =
  | { type: "user_interim_transcript"; text: string; conversation_id?: string; segmentId?: string }
  | { type: "user_final_transcript"; text: string; conversation_id?: string; segmentId?: string }
  | { type: "assistant_interim_transcript"; text: string; conversation_id?: string; segmentId?: string }
  | { type: "assistant_text"; text: string; conversation_id?: string; segmentId?: string }
  | { type: "stt_error"; message?: string };
