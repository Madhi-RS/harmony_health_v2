"""T2.8-T2.14 — AuthService unit tests."""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.models.user import User, UserRole
from app.services.auth_service import AuthService
from app.schemas.user import UserCreate
from app.core.exceptions import DuplicateException, UnauthorizedException


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def auth_service(mock_db):
    return AuthService(mock_db)


@pytest.fixture
def sample_user():
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = "existing@example.com"
    user.username = "existinguser"
    user.password_hash = "$2b$12$hashedpassword"
    user.role = UserRole.RECEPTIONIST
    user.is_active = True
    return user


class TestAuthService:
    """Tests for AuthService business logic."""

    @pytest.mark.asyncio
    async def test_register_creates_user(self, auth_service, mock_db, sample_user):
        """T2.8 — Register creates user successfully."""
        # Mock repository
        mock_repo = AsyncMock()
        mock_repo.find_by_email.return_value = None
        mock_repo.find_by_username.return_value = None
        mock_repo.create.return_value = sample_user
        auth_service.repo = mock_repo

        data = UserCreate(
            email="new@example.com",
            username="newuser",
            password="SecurePass123!",
        )
        result = await auth_service.register(data)

        assert result.access_token is not None
        assert result.refresh_token is not None
        assert result.user.email == "existing@example.com"
        mock_repo.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, auth_service, mock_db, sample_user):
        """T2.8 — Duplicate email raises error."""
        mock_repo = AsyncMock()
        mock_repo.find_by_email.return_value = sample_user
        auth_service.repo = mock_repo

        data = UserCreate(
            email="existing@example.com",
            username="newuser",
            password="SecurePass123!",
        )
        with pytest.raises(DuplicateException):
            await auth_service.register(data)

    @pytest.mark.asyncio
    async def test_login_success(self, auth_service, mock_db, sample_user):
        """T2.10 — Login with valid credentials returns tokens."""
        mock_repo = AsyncMock()
        # Return a real user with real password hash
        from app.core.security import hash_password
        real_hash = hash_password("CorrectPass123!")
        sample_user.password_hash = real_hash
        mock_repo.find_active_by_email.return_value = sample_user
        auth_service.repo = mock_repo

        result = await auth_service.login("test@example.com", "CorrectPass123!")
        assert result.access_token is not None
        assert result.refresh_token is not None

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, auth_service, mock_db, sample_user):
        """T2.10 — Wrong password raises error."""
        from app.core.security import hash_password
        mock_repo = AsyncMock()
        sample_user.password_hash = hash_password("CorrectPass123!")
        mock_repo.find_active_by_email.return_value = sample_user
        auth_service.repo = mock_repo

        with pytest.raises(UnauthorizedException) as exc:
            await auth_service.login("test@example.com", "WrongPass!")
        assert "Invalid email or password" in str(exc.value)

    @pytest.mark.asyncio
    async def test_login_inactive_user(self, auth_service, mock_db, sample_user):
        """T2.11 — Inactive user login raises error."""
        mock_repo = AsyncMock()
        mock_repo.find_active_by_email.return_value = None
        auth_service.repo = mock_repo

        with pytest.raises(UnauthorizedException):
            await auth_service.login("inactive@example.com", "AnyPass123!")

    @pytest.mark.asyncio
    async def test_refresh_token_valid(self, auth_service, mock_db, sample_user):
        """T2.12 — Valid refresh token returns new tokens."""
        from app.core.security import create_refresh_token
        refresh = create_refresh_token(subject=str(sample_user.id))

        mock_repo = AsyncMock()
        mock_repo.get.return_value = sample_user
        auth_service.repo = mock_repo

        result = await auth_service.refresh_token(refresh)
        assert result.access_token is not None
        assert result.refresh_token is not None

    @pytest.mark.asyncio
    async def test_refresh_token_expired(self, auth_service, mock_db):
        """T2.13 — Expired refresh token raises error."""
        with pytest.raises(UnauthorizedException):
            await auth_service.refresh_token("invalid-token-garbage")
