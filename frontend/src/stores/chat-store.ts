"use client";

import { create } from "zustand";
import type { Conversation } from "@/types/conversation";

interface ChatState {
  activeConversationId: string | null;
  conversations: Conversation[];
  isVoiceMode: boolean;
  isRecording: boolean;
  audioLevel: number;

  setActiveConversation: (id: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  toggleVoiceMode: () => void;
  setVoiceMode: (enabled: boolean) => void;
  setRecording: (recording: boolean) => void;
  setAudioLevel: (level: number) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  activeConversationId: null,
  conversations: [],
  isVoiceMode: false,
  isRecording: false,
  audioLevel: 0,

  setActiveConversation: (id) =>
    set({ activeConversationId: id }),

  setConversations: (conversations) =>
    set({ conversations }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),

  toggleVoiceMode: () =>
    set((state) => ({ isVoiceMode: !state.isVoiceMode })),

  setVoiceMode: (enabled) =>
    set({ isVoiceMode: enabled }),

  setRecording: (recording) =>
    set({ isRecording: recording }),

  setAudioLevel: (level) =>
    set({ audioLevel: level }),
}));
