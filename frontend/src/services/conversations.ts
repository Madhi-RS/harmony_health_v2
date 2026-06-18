import api from "@/lib/axios";
import type {
  Conversation,
  ConversationCreate,
  Message,
  ChatRequest,
  ChatResponse,
} from "@/types/conversation";

export const conversationService = {
  async list(params?: {
    page?: number;
    size?: number;
  }): Promise<Conversation[]> {
    const response = await api.get<Conversation[]>("/conversations", {
      params,
    });
    return response.data;
  },

  async get(id: string): Promise<Conversation> {
    const response = await api.get<Conversation>(`/conversations/${id}`);
    return response.data;
  },

  async create(data: ConversationCreate): Promise<Conversation> {
    const response = await api.post<Conversation>("/conversations", data);
    return response.data;
  },

  async getMessages(
    conversationId: string,
    params?: { page?: number; size?: number }
  ): Promise<Message[]> {
    const response = await api.get<Message[]>(
      `/conversations/${conversationId}/messages`,
      { params }
    );
    return response.data;
  },

  async sendChat(data: ChatRequest): Promise<ChatResponse> {
    const response = await api.post<ChatResponse>("/chat", data);
    return response.data;
  },
};
