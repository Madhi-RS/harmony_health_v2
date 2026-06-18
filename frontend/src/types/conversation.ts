export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM";
export type MessageType = "TEXT" | "VOICE";

export interface Conversation {
  id: string;
  patient_id: string | null;
  user_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationCreate {
  patient_id?: string | null;
  title?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  message_type: MessageType;
  audio_url: string | null;
  created_at: string;
}

export interface ChatRequest {
  conversation_id: string;
  message: string;
}

export interface ChatResponse {
  message: Message;
  conversation: Conversation;
}
