"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Mic, MicOff, Loader2 } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  onStartVoice?: () => void;
  onStopVoice?: () => Promise<Blob | null>;
  isRecording?: boolean;
}

export function ChatInput({
  onSend,
  isLoading,
  disabled,
  onStartVoice,
  onStopVoice,
  isRecording,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isVoiceMode = useChatStore((s) => s.isVoiceMode);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, [text]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || isLoading || disabled) return;
    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleStopRecording = async () => {
    if (onStopVoice) {
      await onStopVoice();
    }
  };

  if (isVoiceMode) {
    return (
      <div className="border-t p-4">
        <div className="flex items-center justify-center gap-4">
          {isRecording ? (
            <>
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
                </span>
                <span className="text-sm text-muted-foreground animate-pulse">
                  Recording...
                </span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopRecording}
              >
                <MicOff className="h-4 w-4 mr-2" />
                Stop
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="lg"
              className="rounded-full h-14 w-14"
              onClick={onStartVoice}
            >
              <Mic className="h-6 w-6" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border-t p-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            rows={1}
            disabled={isLoading || disabled}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[40px] max-h-[120px]"
          />
        </div>

        {onStartVoice && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => useChatStore.getState().toggleVoiceMode()}
            disabled={isLoading}
          >
            <Mic className="h-4 w-4" />
          </Button>
        )}

        <Button
          type="submit"
          size="icon"
          disabled={!text.trim() || isLoading || disabled}
          className="shrink-0"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </form>
  );
}
