"use client";

import type { VoiceUiState } from "@/types/voice";

interface VoiceStatusProps {
  state: VoiceUiState;
  error?: string | null;
  sessionId?: string | null;
  className?: string;
}

/** Maps each VoiceUiState to a human-readable label. */
export function voiceStateLabel(state: VoiceUiState): string {
  switch (state) {
    case "idle":
      return "Voice chat ready";
    case "creating_session":
      return "Starting voice session...";
    case "connecting_livekit":
      return "Connecting audio...";
    case "connected":
      return "Connected";
    case "listening":
      return "Listening...";
    case "assistant_speaking":
      return "Assistant speaking...";
    case "reconnecting":
      return "Reconnecting...";
    case "ending":
      return "Ending voice session...";
    case "ended":
      return "Call ended";
    case "error":
      return "Voice unavailable";
    default:
      return "";
  }
}

/** A small inline status indicator for the voice call. */
export function VoiceStatus({
  state,
  error,
  sessionId,
  className = "",
}: VoiceStatusProps) {
  const label = voiceStateLabel(state);
  const isActive =
    state === "listening" ||
    state === "assistant_speaking" ||
    state === "connected";

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      {/* Status dot */}
      {state === "error" ? (
        <span className="h-2 w-2 rounded-full bg-destructive" />
      ) : isActive ? (
        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
      ) : state === "idle" || state === "ended" ? (
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
      )}

      {/* Label */}
      <span
        className={
          state === "error"
            ? "text-destructive"
            : isActive
              ? "text-green-600"
              : "text-muted-foreground"
        }
      >
        {error && state === "error" ? error : label}
      </span>

      {/* Session ID for debug */}
      {sessionId && (
        <span className="text-muted-foreground/50 hidden md:inline">
          #{sessionId.slice(0, 8)}
        </span>
      )}
    </div>
  );
}
