"use client";

import { Button } from "@/components/ui/button";
import { Mic, MicOff, X, Volume2, VolumeX } from "lucide-react";

interface VoiceControlBarProps {
  isRecording: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  duration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancel: () => void;
  isSupported: boolean;
  error: string | null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VoiceControlBar({
  isRecording,
  isSpeaking,
  audioLevel,
  duration,
  onStartRecording,
  onStopRecording,
  onCancel,
  isSupported,
  error,
}: VoiceControlBarProps) {
  if (!isSupported) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted/50 border-t animate-in slide-in-from-bottom">
      {/* Left: status */}
      <div className="flex items-center gap-3">
        {isRecording ? (
          <>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
            </span>
            <span className="text-sm font-mono tabular-nums text-destructive">
              {formatDuration(duration)}
            </span>
            {/* Audio level meter */}
            <div className="flex items-end gap-0.5 h-5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-destructive transition-all duration-75"
                  style={{
                    height: `${Math.min(audioLevel * 120 * (1 + i * 0.15), 100)}%`,
                    opacity: audioLevel > i * 0.08 ? 1 : 0.2,
                  }}
                />
              ))}
            </div>
          </>
        ) : isSpeaking ? (
          <>
            <Volume2 className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-sm text-muted-foreground">Speaking...</span>
          </>
        ) : error ? (
          <>
            <MicOff className="h-4 w-4 text-destructive" />
            <span className="text-xs text-destructive">{error}</span>
          </>
        ) : (
          <>
            <Mic className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Tap to speak
            </span>
          </>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {isRecording ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={onStopRecording}
            >
              <MicOff className="h-4 w-4 mr-1" />
              Stop
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCancel}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onStartRecording}
            disabled={!!error}
          >
            <Mic className="h-4 w-4 mr-1" />
            Record
          </Button>
        )}
      </div>
    </div>
  );
}
