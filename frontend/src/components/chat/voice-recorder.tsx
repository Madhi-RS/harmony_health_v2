"use client";

import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, AlertCircle } from "lucide-react";

interface VoiceRecorderProps {
  isRecording: boolean;
  isSupported: boolean;
  error: string | null;
  audioLevel: number;
  duration: number;
  onStart: () => void;
  onStop: () => void;
  size?: "sm" | "md" | "lg";
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({
  isRecording,
  isSupported,
  error,
  audioLevel,
  duration,
  onStart,
  onStop,
  size = "md",
}: VoiceRecorderProps) {
  const sizeClasses = {
    sm: "h-10 w-10",
    md: "h-14 w-14",
    lg: "h-20 w-20",
  };

  if (!isSupported) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="rounded-full bg-muted p-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          Voice recording is not supported in this browser
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
        </div>
        <p className="text-xs text-destructive max-w-[200px]">{error}</p>
        <Button variant="outline" size="sm" onClick={onStart}>
          Retry
        </Button>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex flex-col items-center gap-3">
        {/* Audio level ring */}
        <button
          onClick={onStop}
          className="relative group"
          aria-label="Stop recording"
        >
          <div
            className={`${sizeClasses[size]} rounded-full bg-destructive flex items-center justify-center transition-transform group-hover:scale-105`}
          >
            <MicOff className="h-5 w-5 text-white" />
          </div>
        </button>

        <div className="flex items-center gap-2 text-sm">
          {/* Audio level indicator */}
          <div className="flex items-end gap-0.5 h-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-destructive transition-all duration-100"
                style={{
                  height: `${Math.min(audioLevel * 100 * (1 + i * 0.2), 100)}%`,
                  opacity: audioLevel > i * 0.12 ? 1 : 0.3,
                }}
              />
            ))}
          </div>

          {/* Recording dot + duration */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
          </span>
          <span className="text-destructive font-mono tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onStart}
      className={`${sizeClasses[size]} rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-all hover:scale-105 active:scale-95`}
      aria-label="Start recording"
    >
      <Mic className="h-5 w-5 text-primary-foreground" />
    </button>
  );
}
