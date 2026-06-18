"""T4.1-T4.4 — ConversationRepository + MessageRepository unit tests."""

import pytest
import pytest_asyncio
from datetime import datetime, timezone

from app.models.user import User, UserRole
from app.models.conversation import MessageRole, MessageType
from app.repositories.conversation_repository import ConversationRepository, MessageRepository
from app.repositories.user_repository import UserRepository
from app.core.security import hash_password


@pytest_asyncio.fixture
async def test_user(db_session):
    repo = UserRepository(db_session)
    return await repo.create(
        email="conv_test@example.com",
        username="conv_tester",
        password_hash=hash_password("Pass123!"),
        role=UserRole.RECEPTIONIST,
    )


class TestConversationRepository:
    """Tests for Conversation CRUD."""

    @pytest.mark.asyncio
    async def test_create_conversation(self, db_session, test_user):
        """T4.1 — Create conversation with user and title."""
        repo = ConversationRepository(db_session)
        conv = await repo.create(
            user_id=test_user.id,
            title="Test Conversation",
        )
        assert conv.id is not None
        assert conv.title == "Test Conversation"
        assert conv.user_id == test_user.id

    @pytest.mark.asyncio
    async def test_list_by_user(self, db_session, test_user):
        """T4.2 — List conversations ordered by updated_at desc."""
        repo = ConversationRepository(db_session)
        c1 = await repo.create(user_id=test_user.id, title="First")
        c2 = await repo.create(user_id=test_user.id, title="Second")

        items, total = await repo.list_by_user(test_user.id)
        assert total == 2
        # Most recent first
        assert items[0].title == "Second"

    @pytest.mark.asyncio
    async def test_get_with_messages(self, db_session, test_user):
        """T4.3 — Conversation loaded with messages."""
        conv_repo = ConversationRepository(db_session)
        msg_repo = MessageRepository(db_session)

        conv = await conv_repo.create(user_id=test_user.id, title="Messages")
        await msg_repo.create(
            conversation_id=conv.id,
            role=MessageRole.USER,
            content="Hello",
            message_type=MessageType.TEXT,
        )
        await msg_repo.create(
            conversation_id=conv.id,
            role=MessageRole.ASSISTANT,
            content="Hi there!",
            message_type=MessageType.TEXT,
        )

        # Refresh to load relationship
        await db_session.refresh(conv, ["messages"])
        assert len(conv.messages) == 2

        # Also verify via fresh fetch
        fetched = await conv_repo.get(conv.id)
        assert fetched is not None
        assert len(fetched.messages) == 2

    @pytest.mark.asyncio
    async def test_message_ordering(self, db_session, test_user):
        """T4.4 — Messages ordered by created_at asc."""
        conv_repo = ConversationRepository(db_session)
        msg_repo = MessageRepository(db_session)

        conv = await conv_repo.create(user_id=test_user.id, title="Ordering")
        m1 = await msg_repo.create(
            conversation_id=conv.id, role=MessageRole.USER,
            content="First", message_type=MessageType.TEXT,
        )
        m2 = await msg_repo.create(
            conversation_id=conv.id, role=MessageRole.ASSISTANT,
            content="Second", message_type=MessageType.TEXT,
        )

        items, total = await msg_repo.list_by_conversation(conv.id)
        assert total == 2
        assert items[0].content == "First"
        assert items[1].content == "Second"

    @pytest.mark.asyncio
    async def test_get_recent_limit(self, db_session, test_user):
        """T4.27 — Only last N messages returned for context."""
        conv_repo = ConversationRepository(db_session)
        msg_repo = MessageRepository(db_session)

        conv = await conv_repo.create(user_id=test_user.id, title="Context")
        for i in range(25):
            await msg_repo.create(
                conversation_id=conv.id, role=MessageRole.USER,
                content=f"Msg {i}", message_type=MessageType.TEXT,
            )

        recent = await msg_repo.get_recent(conv.id, limit=10)
        assert len(recent) == 10
        assert recent[0].content == "Msg 15"  # Most recent first, but reversed
        assert recent[-1].content == "Msg 24"

    @pytest.mark.asyncio
    async def test_ownership_check(self, db_session, test_user):
        """Conversation created by one user has correct user_id."""
        repo = ConversationRepository(db_session)
        conv = await repo.create(user_id=test_user.id)
        assert str(conv.user_id) == str(test_user.id)
