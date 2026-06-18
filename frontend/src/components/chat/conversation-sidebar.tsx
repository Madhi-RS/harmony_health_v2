"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chat-store";
import { useConversations, useCreateConversation } from "@/hooks/use-conversations";
import { formatDistanceToNow } from "date-fns";
import { Plus, MessageSquare, Mic } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function ConversationSidebar() {
  const router = useRouter();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const conversations = useChatStore((s) => s.conversations);

  const { isLoading } = useConversations();
  const createMutation = useCreateConversation();

  const handleNewConversation = () => {
    createMutation.mutate({ title: "New Conversation" });
  };

  const handleSelect = (id: string) => {
    setActiveConversation(id);
  };

  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-3 border-b">
        <Button
          onClick={handleNewConversation}
          className="w-full justify-start gap-2"
          size="sm"
          disabled={createMutation.isPending}
        >
          <Plus className="h-4 w-4" />
          New Conversation
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No conversations yet
          </p>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleSelect(conv.id)}
              className={cn(
                "w-full text-left p-3 rounded-md transition-colors text-sm",
                activeConversationId === conv.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{conv.title || "Conversation"}</span>
              </div>
              <p className="text-[10px] mt-1 opacity-60 pl-5.5">
                {formatDistanceToNow(new Date(conv.updated_at), {
                  addSuffix: true,
                })}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
