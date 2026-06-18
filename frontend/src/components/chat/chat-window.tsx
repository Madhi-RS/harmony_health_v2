"use client";

import { useRef, useEffect } from "react";
import { ChatMessageBubble } from "./chat-message-bubble";
import { ChatInput } from "./chat-input";
import { EmptyState } from "@/components/shared/empty-state";
import { useMessages } from "@/hooks/use-conversations";
import { useChat } from "@/hooks/use-chat";
import { useVoice } from "@/hooks/use-voice";
import { useChatStore } from "@/stores/chat-store";
import { MessageSquare, Loader2 } from "lucide-react";

interface ChatWindowProps {
  conversationId: string;
}

export function ChatWindow({ conversationId }: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: initialMessages, isLoading: isMessagesLoading } = useMessages(
    conversationId,
    { page: 1, size: 100 }
  );

  const {
    messages,
    isLoading: isSending,
    sendMessage,
  } = useChat(conversationId, initialMessages || []);

  const {
    isRecording,
    startRecording,
    stopRecording,
    playAudio,
  } = useVoice();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Sync messages from server when they load
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      // useChat starts with initialMessages in the existingMessages param
    }
  }, [initialMessages]);

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const displayMessages = messages.length > 0 ? messages : (initialMessages || []);

  return (
    <div className="flex-1 flex flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayMessages.length === 0 ? (
          <EmptyState
            title="Start a conversation"
            description="Send a message to begin chatting with the AI receptionist."
            icon={<MessageSquare className="h-10 w-10 text-muted-foreground" />}
          />
        ) : (
          displayMessages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              onPlayAudio={playAudio}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatInput
        onSend={(text) => sendMessage(conversationId, text)}
        isLoading={isSending}
        disabled={!conversationId}
        onStartVoice={startRecording}
        onStopVoice={stopRecording}
        isRecording={isRecording}
      />
    </div>
  );
}
