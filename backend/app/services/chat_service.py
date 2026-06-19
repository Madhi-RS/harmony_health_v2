from __future__ import annotations

import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException, ForbiddenException
from app.models.user import User, UserRole
from app.models.conversation import MessageRole, MessageType
from app.repositories.conversation_repository import ConversationRepository, MessageRepository
from app.services.ai_client import AIClient
from app.services.conversation_service import ConversationService
from app.schemas.conversation import ChatRequest, ChatResponse, MessageResponse


class ChatService:
    """Orchestrates the chat flow: load history -> append user -> AI -> store assistant -> return."""

    def __init__(self, db: AsyncSession, current_user: User):
        self.db = db
        self.user = current_user
        self.conv_repo = ConversationRepository(db)
        self.msg_repo = MessageRepository(db)
        self.conv_service = ConversationService(db, current_user)
        self.ai_client = AIClient()

    async def process_message(self, request: ChatRequest) -> ChatResponse:
        """Process a chat message through the full pipeline.

        Flow:
            1. Load conversation (with ownership check)
            2. Append user message (TEXT modality)
            3. Build conversation context from recent messages
            4. Send to external AI service
            5. Append assistant response
            6. Return both messages
        """
        # 1. Load and validate conversation
        conv = await self.conv_repo.get(request.conversation_id)
        if conv is None:
            raise NotFoundException("Conversation", str(request.conversation_id))

        if self.user.role == UserRole.RECEPTIONIST:
            if str(conv.user_id) != str(self.user.id):
                raise ForbiddenException(
                    "Receptionists can only use their own conversations"
                )

        # 2. Append user message
        user_message = await self.conv_service.append_message(
            conversation_id=request.conversation_id,
            role=MessageRole.USER,
            content=request.message,
            message_type=MessageType.TEXT,
        )

        # 3. Build conversation context from recent messages
        recent_messages = await self.msg_repo.get_recent(
            request.conversation_id, limit=20,
        )
        conversation_history = [
            {"role": "user" if m.role == MessageRole.USER else "assistant",
             "content": m.content}
            for m in recent_messages
            if m.role in (MessageRole.USER, MessageRole.ASSISTANT)
        ]

        # 4. Send to AI service
        ai_response = await self.ai_client.send_message_safe(
            message=request.message,
            conversation_history=conversation_history,
        )

        # 5. Append assistant response
        assistant_message = await self.conv_service.append_message(
            conversation_id=request.conversation_id,
            role=MessageRole.ASSISTANT,
            content=ai_response,
            message_type=MessageType.TEXT,
        )

        # 6. Return
        from app.schemas.conversation import ConversationResponse
        return ChatResponse(
            message=MessageResponse.model_validate(assistant_message),
            conversation=ConversationResponse.model_validate(conv),
        )

    async def sync_voice_message(
        self,
        conversation_id: uuid.UUID,
        transcript: str,
        audio_url: str | None = None,
    ) -> ChatResponse:
        """Process a voice message through the pipeline. Called by voice service.

        Flow:
            1. Load conversation
            2. Append user voice message with audio_url
            3. Build context
            4. Send to AI
            5. Append assistant response (TEXT modality)
            6. Return
        """
        conv = await self.conv_repo.get(conversation_id)
        if conv is None:
            raise NotFoundException("Conversation", str(conversation_id))

        # 2. Append voice user message
        user_message = await self.conv_service.append_message(
            conversation_id=conversation_id,
            role=MessageRole.USER,
            content=transcript,
            message_type=MessageType.VOICE,
            audio_url=audio_url,
        )

        # 3. Build context
        recent_messages = await self.msg_repo.get_recent(
            conversation_id, limit=20,
        )
        conversation_history = [
            {"role": "user" if m.role == MessageRole.USER else "assistant",
             "content": m.content}
            for m in recent_messages
            if m.role in (MessageRole.USER, MessageRole.ASSISTANT)
        ]

        # 4. Send to AI
        ai_response = await self.ai_client.send_message_safe(
            message=transcript,
            conversation_history=conversation_history,
        )

        # 5. Store assistant response
        assistant_message = await self.conv_service.append_message(
            conversation_id=conversation_id,
            role=MessageRole.ASSISTANT,
            content=ai_response,
            message_type=MessageType.TEXT,
        )

        from app.schemas.conversation import ConversationResponse
        return ChatResponse(
            message=MessageResponse.model_validate(assistant_message),
            conversation=ConversationResponse.model_validate(conv),
        )
