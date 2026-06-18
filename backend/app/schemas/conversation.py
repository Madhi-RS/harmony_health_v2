import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.models.conversation import MessageRole, MessageType


class ConversationCreate(BaseModel):
    patient_id: Optional[uuid.UUID] = None
    title: Optional[str] = None


class ConversationResponse(BaseModel):
    id: uuid.UUID
    patient_id: Optional[uuid.UUID] = None
    user_id: Optional[uuid.UUID] = None
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: MessageRole
    content: str
    message_type: MessageType
    audio_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatRequest(BaseModel):
    conversation_id: uuid.UUID
    message: str


class ChatResponse(BaseModel):
    message: MessageResponse
    conversation: ConversationResponse


class VoiceSyncRequest(BaseModel):
    conversation_id: uuid.UUID
    transcript: str
    audio_url: Optional[str] = None
