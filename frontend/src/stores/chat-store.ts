"use client";

import { create } from "zustand";
import type { Conversation } from "@/types/conversation";

interface ChatState {
  activeConversationId: string | null;
  conversations: Conversation[];

  setActiveConversation: (id: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  activeConversationId: null,
  conversations: [],

  setActiveConversation: (id) =>
    set({ activeConversationId: id }),

  setConversations: (conversations) =>
    set({ conversations }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),
}));
