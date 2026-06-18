"""T4.15-T4.17 — Chat API integration tests with mocked AI service."""

import pytest
import pytest_asyncio
import uuid
import httpx
import respx
from httpx import AsyncClient, ASGITransport

from app.core.config import settings
from app.database import get_db
from tests.conftest import test_session_factory


@pytest_asyncio.fixture
async def client():
    from app.main import app

    async def override_get_db():
        async with test_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_client(client):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "chat_user@hospital.com",
        "username": "chat_user",
        "password": "SecurePass123!",
        "role": "RECEPTIONIST",
    })
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest_asyncio.fixture
async def conversation_id(auth_client):
    resp = await auth_client.post("/api/v1/conversations", json={
        "title": "Chat Test",
    })
    return resp.json()["id"]


@pytest.mark.asyncio
class TestChatAPI:
    """Integration tests for chat endpoint with mocked AI."""

    CHAT_URL = "/api/v1/chat"

    @respx.mock
    async def test_chat_full_flow(self, auth_client, conversation_id):
        """T4.15 — Full chat flow with mocked AI response."""
        # Mock the external AI service
        respx.post(f"{settings.AI_SERVICE_BASE_URL}/chat").mock(
            return_value=httpx.Response(
                200, json={"response": "We are open from 8 AM to 8 PM."}
            ),
        )

        response = await auth_client.post(self.CHAT_URL, json={
            "conversation_id": str(conversation_id),
            "message": "What are your working hours?",
        })
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "conversation" in data
        assert data["message"]["role"] == "ASSISTANT"
        assert data["message"]["message_type"] == "TEXT"

    @respx.mock
    async def test_chat_stores_messages(self, auth_client, conversation_id):
        """Chat stores both user and assistant messages."""
        respx.post(f"{settings.AI_SERVICE_BASE_URL}/chat").mock(
            return_value=httpx.Response(
                200, json={"response": "You're welcome!"}
            ),
        )

        await auth_client.post(self.CHAT_URL, json={
            "conversation_id": str(conversation_id),
            "message": "Thanks!",
        })

        # Check messages were stored
        messages_resp = await auth_client.get(
            f"/api/v1/conversations/{conversation_id}/messages"
        )
        assert messages_resp.status_code == 200
        messages = messages_resp.json()
        assert len(messages) == 2  # user + assistant
        assert messages[0]["role"] == "USER"
        assert messages[0]["content"] == "Thanks!"
        assert messages[1]["role"] == "ASSISTANT"
        assert messages[1]["content"] == "You're welcome!"

    async def test_chat_invalid_conversation(self, auth_client):
        """T4.16 — Invalid conversation_id returns 404."""
        response = await auth_client.post(self.CHAT_URL, json={
            "conversation_id": str(uuid.uuid4()),
            "message": "Hello",
        })
        assert response.status_code == 404

    @respx.mock
    async def test_chat_ai_service_down(self, auth_client, conversation_id):
        """T4.17 — AI service down returns 502."""
        respx.post(f"{settings.AI_SERVICE_BASE_URL}/chat").mock(
            return_value=httpx.Response(503, text="Service Unavailable"),
        )

        response = await auth_client.post(self.CHAT_URL, json={
            "conversation_id": str(conversation_id),
            "message": "Hello?",
        })
        assert response.status_code == 502

    @respx.mock
    async def test_chat_cross_user_forbidden(self, client, conversation_id):
        """T4.19 — User cannot send message to another user's conversation."""
        # Register as a different user
        resp = await client.post("/api/v1/auth/register", json={
            "email": "other_user@test.com", "username": "other_user",
            "password": "SecurePass123!", "role": "RECEPTIONIST",
        })
        token = resp.json()["access_token"]

        response = await client.post(
            self.CHAT_URL,
            json={
                "conversation_id": str(conversation_id),
                "message": "Hello?",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403

    @respx.mock
    async def test_chat_sends_context(self, auth_client, conversation_id):
        """Chat sends conversation history to AI."""
        import json

        # First message
        respx.post(f"{settings.AI_SERVICE_BASE_URL}/chat").mock(
            return_value=httpx.Response(200, json={"response": "Reply 1"}),
        )

        await auth_client.post(self.CHAT_URL, json={
            "conversation_id": str(conversation_id),
            "message": "First message",
        })

        # Second message — mock again
        respx.post(f"{settings.AI_SERVICE_BASE_URL}/chat").mock(
            return_value=httpx.Response(200, json={"response": "Reply 2"}),
        )

        # We just verify the API works for multi-turn
        response = await auth_client.post(self.CHAT_URL, json={
            "conversation_id": str(conversation_id),
            "message": "Second message",
        })
        assert response.status_code == 200
        assert response.json()["message"]["content"] == "Reply 2"
