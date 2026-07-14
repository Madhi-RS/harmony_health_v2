"use client";

import { useEffect, useRef } from "react";
import type { VoiceTranscriptItem, VoiceUiState } from "@/types/voice";

interface VoiceTranscriptProps {
  transcripts: VoiceTranscriptItem[];
  state: VoiceUiState;
  /** Non-blocking STT/no-transcript warning to surface. */
  sttWarning?: string | null;
  className?: string;
}

/**
 * VoiceTranscript — renders the live transcript of a voice call.
 *
 * Transcript items arrive through LiveKit data/transcription events (see
 * useVoiceSession), NOT from the REST session response. Interim user
 * transcripts are styled differently (muted/italic) from final ones.
 */
export function VoiceTranscript({
  transcripts,
  state,
  sttWarning,
  className = "",
}: VoiceTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest line.
  const lastText = transcripts[transcripts.length - 1]?.text;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcripts.length, lastText]);

  const isCallActive =
    state === "listening" ||
    state === "assistant_speaking" ||
    state === "connected";

  // Nothing to show yet — hint that we're listening while the call is active.
  const showListeningHint = isCallActive && transcripts.length === 0;

  if (!isCallActive && transcripts.length === 0) {
    return null;
  }

  return (
    <div
      ref={scrollRef}
      className={`max-h-40 overflow-y-auto rounded-md bg-muted/40 p-2 text-sm space-y-1.5 ${className}`}
      aria-live="polite"
    >
      {showListeningHint && (
        <p className="text-xs text-muted-foreground italic">Listening…</p>
      )}

      {transcripts.map((t) => (
        <div key={t.id} className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {t.role === "user" ? "You" : "Assistant"}
          </span>
          <span
            className={
              t.role === "user"
                ? t.isFinal
                  ? "text-foreground"
                  : "text-muted-foreground italic"
                : "text-primary"
            }
          >
            {t.text}
          </span>
        </div>
      ))}

      {sttWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-500 pt-1">
          {sttWarning}
        </p>
      )}
    </div>
  );
}
