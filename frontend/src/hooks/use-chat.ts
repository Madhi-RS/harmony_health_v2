"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { conversationService } from "@/services/conversations";
import { chatService } from "@/services/chat";
import { toast } from "sonner";
import type { Message } from "@/types/conversation";

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (conversationId: string, message: string) => Promise<void>;
  sendMessageStream: (conversationId: string, message: string) => Promise<void>;
  optimisticallyAddMessage: (message: Message) => void;
}

export function useChat(
  conversationId: string | null,
  existingMessages: Message[] = []
): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>(existingMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const optimisticallyAddMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  /** Standard REST send — waits for full response. */
  const sendMessage = useCallback(
    async (convId: string, text: string) => {
      if (!text.trim()) return;

      setIsLoading(true);
      setError(null);

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

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsg.id),
          { ...tempUserMsg, id: response.message.id, created_at: response.message.created_at },
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

        queryClient.invalidateQueries({ queryKey: ["messages", convId] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      } catch (err: any) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        const msg = err?.response?.data?.detail || "Failed to send message";
        setError(msg);
        toast.error(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [queryClient]
  );

  /** SSE streaming send — renders response progressively. */
  const sendMessageStream = useCallback(
    async (convId: string, text: string) => {
      if (!text.trim()) return;

      setIsStreaming(true);
      setError(null);

      const tempUserId = `temp-${Date.now()}`;
      const tempUserMsg: Message = {
        id: tempUserId,
        conversation_id: convId,
        role: "USER",
        content: text,
        message_type: "TEXT",
        audio_url: null,
        created_at: new Date().toISOString(),
      };

      // Add user message optimistically
      setMessages((prev) => [...prev, tempUserMsg]);

      // Add empty assistant bubble to stream into
      const assistantId = `streaming-${Date.now()}`;
      const streamingMsg: Message = {
        id: assistantId,
        conversation_id: convId,
        role: "ASSISTANT",
        content: "",
        message_type: "TEXT",
        audio_url: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, streamingMsg]);

      try {
        let fullContent = "";

        for await (const event of chatService.streamChat({
          conversation_id: convId,
          message: text,
        })) {
          if (event.type === "assistant_message" && event.content) {
            fullContent = event.content;
            // Update streaming bubble in-place
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? ({ ...m, content: fullContent, id: (event.id ?? assistantId) } as Message)
                  : m
              )
            );
          } else if (event.type === "error") {
            throw new Error(event.error || "Stream error");
          }
          // user_message event — replace temp user message with real ID
          if (event.type === "user_message" && event.id) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempUserId ? ({ ...m, id: event.id! } as Message) : m
              )
            );
          }
        }

        // Stream complete — invalidate to sync with server
        queryClient.invalidateQueries({ queryKey: ["messages", convId] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      } catch (err: any) {
        // Remove streaming + temp messages on error
        setMessages((prev) =>
          prev.filter((m) => m.id !== tempUserId && m.id !== assistantId)
        );
        const msg = err?.message || "Stream interrupted";
        setError(msg);
        toast.error(msg);
      } finally {
        setIsStreaming(false);
      }
    },
    [queryClient]
  );

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    sendMessageStream,
    optimisticallyAddMessage,
  };
}
