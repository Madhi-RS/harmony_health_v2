"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationService } from "@/services/conversations";
import { useChatStore } from "@/stores/chat-store";
import type { ConversationCreate } from "@/types/conversation";
import { toast } from "sonner";

export function useConversations() {
  const setConversations = useChatStore((s) => s.setConversations);

  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const data = await conversationService.list();
      setConversations(data);
      return data;
    },
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: () => conversationService.get(id),
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  const addConversation = useChatStore((s) => s.addConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  return useMutation({
    mutationFn: (data: ConversationCreate) =>
      conversationService.create(data),
    onSuccess: (conversation) => {
      addConversation(conversation);
      setActiveConversation(conversation.id);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => {
      toast.error("Failed to create conversation");
    },
  });
}

export function useMessages(
  conversationId: string | null,
  params?: { page?: number; size?: number }
) {
  return useQuery({
    queryKey: ["messages", conversationId, params],
    queryFn: () =>
      conversationService.getMessages(conversationId!, params),
    enabled: !!conversationId,
    refetchInterval: false,
  });
}
