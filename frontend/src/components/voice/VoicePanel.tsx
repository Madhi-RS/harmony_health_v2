"use client";

import { VoiceStatus } from "./VoiceStatus";
import { VoiceButton } from "./VoiceButton";
import { VoiceTranscript } from "./VoiceTranscript";
import type {
  VoiceUiState,
  VoiceSession,
  VoiceTranscriptItem,
} from "@/types/voice";

interface VoicePanelProps {
  state: VoiceUiState;
  error: string | null;
  session: VoiceSession | null;
  isMuted: boolean;
  isSupported: boolean;
  transcripts: VoiceTranscriptItem[];
  sttWarning: string | null;
  liveCaption: string | null;
  onStartVoice: () => void;
  onEndVoice: () => void;
  onToggleMute: () => void;
  onRetry: () => void;
  className?: string;
}

/**
 * VoicePanel — additive voice call panel displayed near the text chat.
 *
 * Shows:
 *   - connection status (VoiceStatus)
 *   - microphone permission status
 *   - mute/unmute toggle
 *   - end call button
 *   - fallback message if voice unavailable
 */
export function VoicePanel({
  state,
  error,
  session,
  isMuted,
  isSupported,
  transcripts,
  sttWarning,
  liveCaption,
  onStartVoice,
  onEndVoice,
  onToggleMute,
  onRetry,
  className = "",
}: VoicePanelProps) {
  // ── Browser not supported ──
  if (!isSupported) {
    return (
      <div className={`border rounded-lg p-3 ${className}`}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>⚠️</span>
          <span>
            Voice is not supported in this browser. Please use Chrome, Edge, or
            Firefox.
          </span>
        </div>
      </div>
    );
  }

  // ── Voice is idle or error but no active call ──
  const isIdle = state === "idle" || state === "ended" || state === "error";

  return (
    <div className={`border rounded-lg p-3 space-y-3 ${className}`}>
      {/* Status row */}
      <VoiceStatus
        state={state}
        error={error}
        sessionId={session?.sessionId ?? null}
      />

      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        {isIdle ? (
          <>
            <span className="text-xs text-muted-foreground">
              Voice chat ready
            </span>
            <VoiceButton
              state={state}
              error={error}
              onStart={onStartVoice}
              onEnd={onEndVoice}
              onRetry={state === "error" ? onRetry : undefined}
            />
          </>
        ) : (
          <VoiceButton
            state={state}
            isMuted={isMuted}
            error={error}
            onStart={onStartVoice}
            onEnd={onEndVoice}
            onToggleMute={onToggleMute}
          />
        )}
      </div>

      {/* Live transcript — populated by LiveKit data/transcription events */}
      <VoiceTranscript
        transcripts={transcripts}
        state={state}
        sttWarning={sttWarning}
        liveCaption={liveCaption}
      />

      {/* Fallback message if voice unavailable but panel shown */}
      {state === "error" && (
        <p className="text-xs text-muted-foreground">
          {error ||
            "Voice service is not available right now. You can continue with text chat."}
        </p>
      )}
    </div>
  );
}
