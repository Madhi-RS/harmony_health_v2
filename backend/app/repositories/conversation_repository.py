import uuid
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation, Message
from app.repositories.base import BaseRepository


class ConversationRepository(BaseRepository[Conversation]):
    """Repository for Conversation model."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Conversation)

    async def list_by_user(
        self, user_id: uuid.UUID, page: int = 1, size: int = 10,
    ) -> tuple[list[Conversation], int]:
        filters = [Conversation.user_id == user_id]
        return await self.get_all(
            page=page, size=size, filters=filters,
            order_by=[Conversation.updated_at.desc()],
        )

    async def find_by_external_id(self, external_id: str) -> Optional[Conversation]:
        stmt = select(Conversation).where(
            Conversation.external_conversation_id == external_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()


class MessageRepository(BaseRepository[Message]):
    """Repository for Message model."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Message)

    async def list_by_conversation(
        self,
        conversation_id: uuid.UUID,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[Message], int]:
        filters = [Message.conversation_id == conversation_id]
        return await self.get_all(
            page=page, size=size, filters=filters,
            order_by=[Message.created_at.asc()],
        )

    async def get_recent(
        self, conversation_id: uuid.UUID, limit: int = 20,
    ) -> list[Message]:
        """Get the most recent N messages for context window."""
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        # Return in chronological order
        return list(reversed(result.scalars().all()))
