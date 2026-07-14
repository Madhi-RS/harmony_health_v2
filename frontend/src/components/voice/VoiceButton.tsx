"use client";

import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, PhoneOff, AlertCircle } from "lucide-react";
import type { VoiceUiState } from "@/types/voice";

interface VoiceButtonProps {
  state: VoiceUiState;
  /** Whether the mic is muted (shown when in an active call). */
  isMuted?: boolean;
  error?: string | null;
  onStart: () => void;
  onEnd: () => void;
  onToggleMute?: () => void;
  onRetry?: () => void;
  className?: string;
  disabled?: boolean;
}

/**
 * VoiceButton — the primary voice control.
 *
 * States:
 *   idle           → "Start voice" mic button
 *   creating_*     → spinner + "Cancel"
 *   connected/etc  → "End voice" + optional mute toggle
 *   error          → error message + "Retry" button
 */
export function VoiceButton({
  state,
  isMuted = false,
  error,
  onStart,
  onEnd,
  onToggleMute,
  onRetry,
  className = "",
  disabled = false,
}: VoiceButtonProps) {
  const isTransitioning =
    state === "creating_session" ||
    state === "connecting_livekit" ||
    state === "reconnecting" ||
    state === "ending";

  const isActive =
    state === "connected" ||
    state === "listening" ||
    state === "assistant_speaking";

  // ── Error state ──
  if (state === "error") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          <span className="line-clamp-1 max-w-[180px]">
            {error || "Voice unavailable"}
          </span>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  // ── Transitioning: spinner + Cancel ──
  if (isTransitioning) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">
          {state === "reconnecting"
            ? "Reconnecting..."
            : state === "ending"
              ? "Ending..."
              : "Connecting..."}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEnd}
          disabled={disabled}
        >
          Cancel
        </Button>
      </div>
    );
  }

  // ── Active call: End call + mute toggle ──
  if (isActive) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {onToggleMute && (
          <Button
            variant={isMuted ? "destructive" : "outline"}
            size="icon"
            className="h-9 w-9"
            onClick={onToggleMute}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4 text-green-600" />
            )}
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          onClick={onEnd}
          disabled={disabled}
        >
          <PhoneOff className="h-4 w-4 mr-1.5" />
          End Voice
        </Button>
      </div>
    );
  }

  // ── Idle / ended: Start button ──
  return (
    <Button
      variant="outline"
      size="sm"
      className={`gap-1.5 ${className}`}
      onClick={onStart}
      disabled={disabled}
    >
      <Mic className="h-4 w-4" />
      Start Voice
    </Button>
  );
}
