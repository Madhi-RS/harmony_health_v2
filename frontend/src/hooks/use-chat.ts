"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { conversationService } from "@/services/conversations";
import { toast } from "sonner";
import type { Message } from "@/types/conversation";

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (conversationId: string, message: string) => Promise<void>;
  optimisticallyAddMessage: (message: Message) => void;
}

export function useChat(
  conversationId: string | null,
  existingMessages: Message[] = []
): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>(existingMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Sync when existing messages change
  const optimisticallyAddMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const sendMessage = useCallback(
    async (convId: string, text: string) => {
      if (!text.trim()) return;

      setIsLoading(true);
      setError(null);

      // Optimistic user message
      const tempUserMsg: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: convId,
        role: "USER",
        content: text,
        message_type: "TEXT",
        audio_url: null,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, tempUserMsg]);

      try {
        const response = await conversationService.sendChat({
          conversation_id: convId,
          message: text,
        });

        // Replace temp message with real one + add assistant response
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsg.id),
          {
            ...tempUserMsg,
            id: response.message.id,
            created_at: response.message.created_at,
          },
          {
            id: response.message.id + "-resp",
            conversation_id: convId,
            role: "ASSISTANT",
            content: response.message.content,
            message_type: "TEXT",
            audio_url: null,
            created_at: response.message.created_at,
          },
        ]);

        // Invalidate messages query to stay in sync
        queryClient.invalidateQueries({
          queryKey: ["messages", convId],
        });
        queryClient.invalidateQueries({
          queryKey: ["conversations"],
        });
      } catch (err: any) {
        // Remove temp message on error
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        const msg =
          err?.response?.data?.detail || "Failed to send message";
        setError(msg);
        toast.error(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [queryClient]
  );

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    optimisticallyAddMessage,
  };
}
