"""T2.15-T2.28 — Auth API integration tests using AsyncClient."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.database import get_db
from tests.conftest import test_session_factory


@pytest_asyncio.fixture
async def client():
    """Create AsyncClient with DB dependency override."""
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


@pytest.fixture
def user_data():
    return {
        "email": "nurse@hospital.com",
        "username": "nurse_jane",
        "password": "SecurePass123!",
        "role": "RECEPTIONIST",
    }


@pytest.mark.asyncio
class TestAuthAPI:
    """Full integration tests for authentication endpoints."""

    REGISTER_URL = "/api/v1/auth/register"
    LOGIN_URL = "/api/v1/auth/login"
    REFRESH_URL = "/api/v1/auth/refresh"
    ME_URL = "/api/v1/auth/me"

    async def test_register_success(self, client, user_data):
        """T2.15 — POST /auth/register returns 201 with tokens."""
        response = await client.post(self.REGISTER_URL, json=user_data)
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == user_data["email"]
        assert data["user"]["username"] == user_data["username"]
        assert "password" not in data

    async def test_register_duplicate_email(self, client, user_data):
        """T2.16 — Duplicate email returns 409."""
        await client.post(self.REGISTER_URL, json=user_data)
        response = await client.post(self.REGISTER_URL, json=user_data)
        assert response.status_code == 409

    async def test_register_validation_error(self, client):
        """T2.17 — Invalid data returns 422."""
        # Missing email
        response = await client.post(self.REGISTER_URL, json={
            "username": "test", "password": "Short1!"
        })
        assert response.status_code == 422

        # Weak password
        response = await client.post(self.REGISTER_URL, json={
            "email": "test@example.com",
            "username": "test",
            "password": "short",
        })
        assert response.status_code == 422

    async def test_login_success(self, client, user_data):
        """T2.18 — POST /auth/login returns tokens."""
        await client.post(self.REGISTER_URL, json=user_data)
        response = await client.post(self.LOGIN_URL, json={
            "email": user_data["email"],
            "password": user_data["password"],
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == user_data["email"]

    async def test_login_wrong_password(self, client, user_data):
        """T2.19 — Wrong password returns 401."""
        await client.post(self.REGISTER_URL, json=user_data)
        response = await client.post(self.LOGIN_URL, json={
            "email": user_data["email"],
            "password": "WrongPassword123!",
        })
        assert response.status_code == 401
        assert "Invalid email or password" in response.text

    async def test_refresh_token(self, client, user_data):
        """T2.20 — POST /auth/refresh returns new tokens."""
        reg = await client.post(self.REGISTER_URL, json=user_data)
        refresh_token = reg.json()["refresh_token"]

        response = await client.post(self.REFRESH_URL, json={
            "refresh_token": refresh_token,
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_get_me(self, client, user_data):
        """T2.21 — GET /auth/me returns current user."""
        reg = await client.post(self.REGISTER_URL, json=user_data)
        access_token = reg.json()["access_token"]

        response = await client.get(
            self.ME_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert response.status_code == 200
        assert response.json()["email"] == user_data["email"]

    async def test_get_me_no_token(self, client):
        """T2.22 — No auth header returns 401."""
        response = await client.get(self.ME_URL)
        assert response.status_code == 401

    async def test_get_me_expired_token(self, client):
        """T2.23 — Expired token returns 401."""
        from datetime import timedelta
        token = create_access_token(
            subject="test-user",
            expires_delta=timedelta(seconds=-1),
        )
        response = await client.get(
            self.ME_URL,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401
