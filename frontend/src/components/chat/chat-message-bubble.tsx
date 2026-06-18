"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Play, Mic, Bot, User } from "lucide-react";
import type { Message } from "@/types/conversation";

interface ChatMessageBubbleProps {
  message: Message;
  onPlayAudio?: (url: string) => void;
  isSpeaking?: boolean;
}

export function ChatMessageBubble({
  message,
  onPlayAudio,
  isSpeaking,
}: ChatMessageBubbleProps) {
  const isUser = message.role === "USER";
  const isVoice = message.message_type === "VOICE";

  return (
    <div
      className={cn(
        "flex gap-3 max-w-[80%]",
        isUser ? "ml-auto flex-row-reverse" : ""
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Content */}
      <div>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {message.content}
        </div>

        {/* Footer */}
        <div
          className={cn(
            "flex items-center gap-2 mt-1",
            isUser ? "justify-end" : ""
          )}
        >
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(message.created_at), "h:mm a")}
          </span>

          {isVoice && onPlayAudio && message.audio_url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => onPlayAudio(message.audio_url!)}
              disabled={isSpeaking}
            >
              <Mic className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
