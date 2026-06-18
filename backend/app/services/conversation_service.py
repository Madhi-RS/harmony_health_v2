from __future__ import annotations

import uuid
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException, ForbiddenException
from app.models.user import User, UserRole
from app.models.conversation import MessageRole, MessageType
from app.repositories.conversation_repository import ConversationRepository, MessageRepository
from app.schemas.conversation import (
    ConversationCreate, ConversationResponse, MessageResponse,
)


class ConversationService:
    """Handles conversation and message management."""

    def __init__(self, db: AsyncSession, current_user: User):
        self.db = db
        self.user = current_user
        self.conv_repo = ConversationRepository(db)
        self.msg_repo = MessageRepository(db)

    async def create(self, data: ConversationCreate) -> ConversationResponse:
        """Create a new conversation."""
        conv = await self.conv_repo.create(
            user_id=self.user.id,
            patient_id=data.patient_id,
            title=data.title or "New Conversation",
        )
        return ConversationResponse.model_validate(conv)

    async def get(self, conversation_id: uuid.UUID) -> ConversationResponse:
        """Get a conversation by ID with ownership check."""
        conv = await self.conv_repo.get(conversation_id)
        if conv is None:
            raise NotFoundException("Conversation", str(conversation_id))
        self._check_ownership(conv)
        return ConversationResponse.model_validate(conv)

    async def list(self, page: int = 1, size: int = 10) -> list[ConversationResponse]:
        """List conversations for the current user."""
        if self.user.role == UserRole.ADMIN:
            items, total = await self.conv_repo.get_all(page=page, size=size)
        else:
            items, total = await self.conv_repo.list_by_user(
                self.user.id, page=page, size=size,
            )
        return [ConversationResponse.model_validate(c) for c in items]

    async def get_messages(
        self, conversation_id: uuid.UUID, page: int = 1, size: int = 50,
    ) -> list[MessageResponse]:
        """Get messages for a conversation with ownership check."""
        conv = await self.conv_repo.get(conversation_id)
        if conv is None:
            raise NotFoundException("Conversation", str(conversation_id))
        self._check_ownership(conv)

        items, total = await self.msg_repo.list_by_conversation(
            conversation_id, page=page, size=size,
        )
        return [MessageResponse.model_validate(m) for m in items]

    async def append_message(
        self,
        conversation_id: uuid.UUID,
        role: MessageRole,
        content: str,
        message_type: MessageType = MessageType.TEXT,
        audio_url: str | None = None,
    ) -> MessageResponse:
        """Append a message to a conversation."""
        msg = await self.msg_repo.create(
            conversation_id=conversation_id,
            role=role,
            content=content,
            message_type=message_type,
            audio_url=audio_url,
        )
        return MessageResponse.model_validate(msg)

    def _check_ownership(self, conversation) -> None:
        """RECEPTIONIST can only access their own conversations."""
        if self.user.role == UserRole.RECEPTIONIST:
            if str(conversation.user_id) != str(self.user.id):
                raise ForbiddenException(
                    "Receptionists can only access their own conversations"
                )
