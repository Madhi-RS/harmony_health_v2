"use client";

import { useEffect } from "react";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { ChatWindow } from "@/components/chat/chat-window";
import { useChatStore } from "@/stores/chat-store";
import { useConversations, useCreateConversation } from "@/hooks/use-conversations";
import { EmptyState } from "@/components/shared/empty-state";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ChatPage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const { isLoading } = useConversations();
  const createMutation = useCreateConversation();

  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      useChatStore.getState().setActiveConversation(conversations[0].id);
    }
  }, [activeConversationId, conversations]);

  const handleStartNew = () => {
    createMutation.mutate({ title: "New Conversation" });
  };

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar — hidden on mobile */}
      <div className="hidden md:flex md:w-72 lg:w-80 shrink-0 border-r">
        <ConversationSidebar />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {activeConversationId ? (
          <ChatWindow conversationId={activeConversationId} />
        ) : (
          <div className="flex-1 flex items-center justify-center min-h-0">
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <EmptyState
                title="AI Receptionist"
                description="Start a conversation with the AI assistant to manage patients and appointments."
                icon={<Bot className="h-12 w-12 text-primary" />}
                action={
                  <Button onClick={handleStartNew} disabled={createMutation.isPending}>
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      "Start New Conversation"
                    )}
                  </Button>
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
