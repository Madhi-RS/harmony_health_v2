"""T4.12-T4.14 — Conversations API integration tests."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

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
        "email": "conv_user@hospital.com",
        "username": "conv_user",
        "password": "SecurePass123!",
        "role": "RECEPTIONIST",
    })
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest.mark.asyncio
class TestConversationsAPI:
    """Integration tests for conversation CRUD endpoints."""

    BASE_URL = "/api/v1/conversations"

    async def test_create_conversation(self, auth_client):
        """T4.12 — Create conversation returns 201."""
        response = await auth_client.post(self.BASE_URL, json={
            "title": "Test Conversation",
        })
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Test Conversation"
        assert "id" in data

    async def test_list_conversations(self, auth_client):
        """T4.13 — List conversations for current user."""
        await auth_client.post(self.BASE_URL, json={"title": "Conv 1"})
        await auth_client.post(self.BASE_URL, json={"title": "Conv 2"})

        response = await auth_client.get(self.BASE_URL)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    async def test_get_conversation(self, auth_client):
        """T4.14 — Get conversation by ID."""
        create_resp = await auth_client.post(self.BASE_URL, json={
            "title": "Get Me",
        })
        conv_id = create_resp.json()["id"]

        response = await auth_client.get(f"{self.BASE_URL}/{conv_id}")
        assert response.status_code == 200
        assert response.json()["id"] == conv_id

    async def test_get_conversation_not_found(self, auth_client):
        """Non-existent conversation returns 404."""
        import uuid
        response = await auth_client.get(f"{self.BASE_URL}/{uuid.uuid4()}")
        assert response.status_code == 404

    async def test_get_messages_empty(self, auth_client):
        """New conversation has no messages."""
        create_resp = await auth_client.post(self.BASE_URL, json={
            "title": "Empty",
        })
        conv_id = create_resp.json()["id"]

        response = await auth_client.get(f"{self.BASE_URL}/{conv_id}/messages")
        assert response.status_code == 200
        assert response.json() == []

    async def test_cross_user_access_denied(self, client):
        """T4.18 — RECEPTIONIST cannot access another's conversation."""
        # Register user A
        resp_a = await client.post("/api/v1/auth/register", json={
            "email": "user_a@test.com", "username": "user_a",
            "password": "SecurePass123!", "role": "RECEPTIONIST",
        })
        token_a = resp_a.json()["access_token"]

        # User A creates a conversation
        resp = await client.post(
            self.BASE_URL,
            json={"title": "User A's Conversation"},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        conv_id = resp.json()["id"]

        # Register user B
        resp_b = await client.post("/api/v1/auth/register", json={
            "email": "user_b@test.com", "username": "user_b",
            "password": "SecurePass123!", "role": "RECEPTIONIST",
        })
        token_b = resp_b.json()["access_token"]

        # User B tries to access User A's conversation
        response = await client.get(
            f"{self.BASE_URL}/{conv_id}",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert response.status_code == 403
