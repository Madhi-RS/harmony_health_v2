/**
 * useVoiceSession — owns the full frontend voice lifecycle.
 *
 * Flow:
 *   idle → creating_session → connecting_livekit → connected → listening
 *        ↔ assistant_speaking ↔ reconnecting
 *        → ending → ended / error
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { voiceApi } from "@/services/voiceApi";
import {
  createLiveKitVoiceClient,
  type LiveKitClientInstance,
} from "@/services/livekitVoiceClient";
import type {
  VoiceUiState,
  VoiceSession,
  VoiceSessionResponse,
  LiveKitConnection,
  VoiceTranscriptItem,
  VoiceDataEvent,
} from "@/types/voice";

/**
 * How long to wait in the "listening" state without any transcript event
 * before showing a non-blocking "I couldn't hear that" warning (P3).
 */
const NO_TRANSCRIPT_TIMEOUT_MS = 8000;

interface UseVoiceSessionReturn {
  /** Current UI state. */
  state: VoiceUiState;
  /** Human-readable error message, if any. */
  error: string | null;
  /** Session info (session_id, conversation_id, room_name). */
  session: VoiceSession | null;
  /** Whether the local microphone is muted. */
  isMuted: boolean;
  /** Ordered transcript history for the current call. */
  transcripts: VoiceTranscriptItem[];
  /** Most recent user transcript (interim or final), if any. */
  latestUserTranscript: VoiceTranscriptItem | null;
  /** Most recent assistant text, if any. */
  latestAssistantText: VoiceTranscriptItem | null;
  /** Non-blocking STT/no-transcript warning to surface in the UI. */
  sttWarning: string | null;
  /** Clear the transcript history. */
  clearTranscripts: () => void;
  /** Start a voice call. Requests mic first, then creates backend session. */
  startVoice: () => Promise<void>;
  /** End a voice call. Disconnects LiveKit and calls DELETE session. */
  endVoice: () => Promise<void>;
  /** Toggle microphone mute. */
  toggleMute: () => void;
  /** Manually trigger reconnect after a permanent disconnect. */
  reconnect: () => Promise<void>;
  /** Whether voice is supported in this browser. */
  isSupported: boolean;
}

export function useVoiceSession(): UseVoiceSessionReturn {
  const [state, setState] = useState<VoiceUiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [transcripts, setTranscripts] = useState<VoiceTranscriptItem[]>([]);
  const [sttWarning, setSttWarning] = useState<string | null>(null);

  const lkClientRef = useRef<LiveKitClientInstance | null>(null);
  const connectionRef = useRef<LiveKitConnection | null>(null);
  const isStartingRef = useRef(false);
  const isEndingRef = useRef(false);
  /** Monotonic counter for transcript item ids (avoids Math.random). */
  const transcriptSeqRef = useRef(0);
  /** Timer that fires an STT warning if no final transcript arrives. */
  const noTranscriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported =
    typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  // ── Transcript handling ──

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
    setSttWarning(null);
  }, []);

  const clearNoTranscriptTimer = useCallback(() => {
    if (noTranscriptTimerRef.current) {
      clearTimeout(noTranscriptTimerRef.current);
      noTranscriptTimerRef.current = null;
    }
  }, []);

  const handleTranscript = useCallback(
    (event: VoiceDataEvent) => {
      // Any transcript activity clears a pending no-transcript warning.
      clearNoTranscriptTimer();

      if (event.type === "stt_error") {
        setSttWarning(
          event.message || "Speech recognition is unavailable right now."
        );
        return;
      }

      // A user/assistant transcript arrived — clear stale warnings.
      setSttWarning(null);

      const role: "user" | "assistant" =
        event.type === "assistant_text" ? "assistant" : "user";
      const isFinal =
        event.type === "user_final_transcript" ||
        event.type === "assistant_text";
      const text = event.text ?? "";
      if (!text) return;

      setTranscripts((prev) => {
        const next = [...prev];
        // Collapse consecutive non-final entries of the same role into one
        // "live" line so interim results update in place instead of stacking.
        const last = next[next.length - 1];
        if (last && last.role === role && !last.isFinal) {
          next[next.length - 1] = {
            ...last,
            text,
            isFinal,
            timestamp: last.timestamp,
          };
          return next;
        }

        transcriptSeqRef.current += 1;
        next.push({
          id: `t-${transcriptSeqRef.current}`,
          role,
          text,
          isFinal,
          timestamp: transcriptSeqRef.current,
        });
        return next;
      });
    },
    [clearNoTranscriptTimer]
  );

  // ── Structured logging ──

  const log = useCallback(
    (tag: string, msg: string, extra?: Record<string, unknown>) => {
      const s = session;
      const ctx = s
        ? ` sid=${s.sessionId} conv=${s.conversationId} room=${s.roomName}`
        : "";
      const extraStr = extra ? " " + JSON.stringify(extra) : "";
      console.log(`[${tag}]${ctx} ${msg}${extraStr}`);
    },
    [session]
  );

  // ── Create the LiveKit client once ──

  const getClient = useCallback((): LiveKitClientInstance => {
    if (!lkClientRef.current) {
      lkClientRef.current = createLiveKitVoiceClient({
        onStateChange: (newState) => {
          console.info("[VOICE_STATE] ui_state ->", newState);
          setState(newState);
          if (newState === "listening") {
            // P3: arm a no-transcript watchdog. If the user speaks but no
            // transcript arrives (backend STT down), surface a warning.
            clearNoTranscriptTimer();
            noTranscriptTimerRef.current = setTimeout(() => {
              setSttWarning(
                "I couldn't hear that. Please try again, or check that speech recognition is available."
              );
            }, NO_TRANSCRIPT_TIMEOUT_MS);
          } else {
            clearNoTranscriptTimer();
          }
          if (newState === "ended") {
            setState("idle");
            setSession(null);
            connectionRef.current = null;
          }
        },
        onError: (msg) => setError(msg),
        onLog: log,
        onTranscript: handleTranscript,
      });
    }
    return lkClientRef.current;
  }, [log, handleTranscript, clearNoTranscriptTimer]);

  // ── startVoice ──

  const startVoice = useCallback(async () => {
    if (isStartingRef.current) {
      log("VOICE", "Already starting — skip");
      return;
    }
    if (!isSupported) {
      setError(
        "Voice recording is not supported in this browser. Please use Chrome, Edge, or Firefox."
      );
      setState("error");
      return;
    }

    isStartingRef.current = true;
    setError(null);
    setSttWarning(null);
    setTranscripts([]);
    transcriptSeqRef.current = 0;

    try {
      // Step 0 — Request microphone permission first (avoids orphan sessions)
      log("MIC", "Requesting permission...");
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the test stream immediately — LiveKit will request its own
        micStream.getTracks().forEach((t) => t.stop());
        log("MIC", "Permission granted");
      } catch (micErr: any) {
        if (micErr.name === "NotAllowedError") {
          setError(
            "Microphone access is required for voice chat. Please allow microphone access in your browser settings and try again."
          );
        } else if (micErr.name === "NotFoundError") {
          setError(
            "No microphone found. Please connect a microphone and try again."
          );
        } else {
          setError(
            "Could not access your microphone. Please check your device settings."
          );
        }
        setState("error");
        isStartingRef.current = false;
        return;
      }

      // Step 1 — Create backend voice session
      setState("creating_session");
      log("VOICE", "Creating session");
      const response: VoiceSessionResponse = await voiceApi.createSession();

      // Validate response
      if (!response.livekit_url || !response.livekit_token) {
        throw new Error("Backend did not return LiveKit connection details.");
      }

      log("VOICE", "Session created", {
        session_id: response.session_id,
        conversation_id: response.conversation_id,
        room_name: response.room_name,
      });

      const voiceSession: VoiceSession = {
        sessionId: response.session_id,
        conversationId: response.conversation_id,
        roomName: response.room_name,
      };
      setSession(voiceSession);

      const connection: LiveKitConnection = {
        livekitUrl: response.livekit_url,
        livekitToken: response.livekit_token,
        roomName: response.room_name,
      };
      connectionRef.current = connection;

      // Step 2 — Connect to LiveKit
      setState("connecting_livekit");
      log("LIVEKIT", "Connecting to room...");
      const client = getClient();
      await client.connect(
        connection.livekitUrl,
        connection.livekitToken,
        connection.roomName
      );

      // State transitions handled by LiveKit client callbacks:
      // connected → listening → assistant_speaking → listening → ...
    } catch (e: any) {
      const statusCode = (e as any).statusCode;
      const msg: string = e?.message || "";

      if (statusCode === 401 || statusCode === 403) {
        setError("Voice authentication failed. Please check the configured voice token.");
      } else if (statusCode === 404) {
        setError("Voice service is not enabled on the server. Please try text chat.");
      } else if (msg.includes("NotAllowedError") || msg.includes("permission")) {
        setError("Microphone access is required for voice chat.");
      } else if (msg.includes("timeout") || msg.includes("network")) {
        setError("Network error. Check your connection and try again.");
      } else {
        setError(
          "Voice service is not available right now. You can continue with text chat."
        );
      }

      log("VOICE", `startVoice failed: ${msg}`, {
        statusCode: statusCode ?? undefined,
      });
      setState("error");

      // Clean up orphan session if one was created
      if (session) {
        voiceApi.endSession(session.sessionId).catch(() => {});
        setSession(null);
      }
      if (lkClientRef.current) {
        lkClientRef.current.disconnect().catch(() => {});
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [isSupported, log, getClient, session]);

  // ── endVoice ──

  const endVoice = useCallback(async () => {
    if (isEndingRef.current) {
      log("VOICE", "Already ending — skip");
      return;
    }
    isEndingRef.current = true;
    setState("ending");
    setError(null);
    clearNoTranscriptTimer();

    try {
      log("VOICE", "Ending voice session");

      // 1. Mute and disconnect LiveKit
      if (lkClientRef.current) {
        await lkClientRef.current.disconnect();
        lkClientRef.current = null;
      }

      // 2. Notify backend to end the session (best-effort)
      const s = session;
      if (s?.sessionId) {
        try {
          await voiceApi.endSession(s.sessionId);
          log("VOICE", "Backend session ended");
        } catch (e: any) {
          log("VOICE", `endSession DELETE failed (non-blocking): ${e.message}`);
        }
      }

      // 3. Reset local state
      setSession(null);
      connectionRef.current = null;
      setState("idle");
    } catch (e: any) {
      log("VOICE", `endVoice error: ${e.message}`);
      setState("idle"); // Always reset — don't leave UI stuck
    } finally {
      isEndingRef.current = false;
    }
  }, [log, session, clearNoTranscriptTimer]);

  // ── toggleMute ──

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    lkClientRef.current?.setMuted(newMuted);
  }, [isMuted]);

  // ── reconnect (manual, after permanent disconnect) ──

  const reconnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) {
      setError("No previous session to reconnect. Please start a new voice call.");
      setState("idle");
      return;
    }

    setState("reconnecting");
    setError(null);

    try {
      const client = getClient();
      await client.connect(conn.livekitUrl, conn.livekitToken, conn.roomName);
    } catch (e: any) {
      setError("Could not reconnect to the voice room. Please try again.");
      setState("error");
    }
  }, [getClient]);

  // ── Cleanup on unmount ──

  const endVoiceRef = useRef(endVoice);
  endVoiceRef.current = endVoice;

  useEffect(() => {
    return () => {
      // Clean up LiveKit and backend session on route change / unmount
      if (lkClientRef.current) {
        lkClientRef.current.disconnect().catch(() => {});
        lkClientRef.current = null;
      }
      if (connectionRef.current) {
        // Best-effort: notify backend
        const s = session;
        if (s?.sessionId) {
          voiceApi.endSession(s.sessionId).catch(() => {});
        }
      }
    };
    // Run only on unmount — intentionally empty deps
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived latest transcripts (recomputed on render — transcripts is small).
  let latestUserTranscript: VoiceTranscriptItem | null = null;
  let latestAssistantText: VoiceTranscriptItem | null = null;
  for (let i = transcripts.length - 1; i >= 0; i--) {
    const t = transcripts[i];
    if (!latestUserTranscript && t.role === "user") latestUserTranscript = t;
    if (!latestAssistantText && t.role === "assistant") latestAssistantText = t;
    if (latestUserTranscript && latestAssistantText) break;
  }

  return {
    state,
    error,
    session,
    isMuted,
    transcripts,
    latestUserTranscript,
    latestAssistantText,
    sttWarning,
    clearTranscripts,
    startVoice,
    endVoice,
    toggleMute,
    reconnect,
    isSupported,
  };
}
