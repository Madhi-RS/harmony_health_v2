from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.core.exceptions import DuplicateException, UnauthorizedException
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserResponse, TokenResponse


def _token_claims(user: User) -> dict:
    """Build JWT claims that the AI Sales Layer expects for tenant-aware auth."""
    return {
        "tenant_id": settings.AI_SERVICE_TENANT_ID,
        "site_id": settings.AI_SERVICE_SITE_ID,
        "roles": [user.role.value],
        "email": user.email,
    }


class AuthService:
    """Handles user registration, login, token management."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = UserRepository(db)

    async def register(self, data: UserCreate) -> TokenResponse:
        """Register a new user and return tokens."""
        # Check for existing email
        existing = await self.repo.find_by_email(data.email)
        if existing:
            raise DuplicateException("User", "email", data.email)

        # Check for existing username
        existing = await self.repo.find_by_username(data.username)
        if existing:
            raise DuplicateException("User", "username", data.username)

        # Create user
        user = await self.repo.create(
            email=data.email.lower().strip(),
            username=data.username.strip(),
            password_hash=hash_password(data.password),
            role=data.role if data.role else UserRole.RECEPTIONIST,
        )

        # Generate tokens
        access_token = create_access_token(subject=str(user.id), **_token_claims(user))
        refresh_token = create_refresh_token(subject=str(user.id))

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserResponse.model_validate(user),
        )

    async def login(self, email: str, password: str) -> TokenResponse:
        """Authenticate user and return tokens."""
        user = await self.repo.find_active_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise UnauthorizedException("Invalid email or password")

        access_token = create_access_token(subject=str(user.id), **_token_claims(user))
        refresh_token = create_refresh_token(subject=str(user.id))

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserResponse.model_validate(user),
        )

    async def refresh_token(self, refresh_token_str: str) -> TokenResponse:
        """Issue new access token from valid refresh token."""
        try:
            payload = decode_token(refresh_token_str)
            if payload.get("type") != "refresh":
                raise UnauthorizedException("Invalid token type")
            user_id = payload.get("sub", "")
            if not user_id:
                raise UnauthorizedException("Invalid token payload")
        except Exception:
            raise UnauthorizedException("Invalid or expired refresh token")

        user = await self.repo.get(user_id)
        if not user or not user.is_active:
            raise UnauthorizedException("User not found or inactive")

        # Rotate tokens
        new_access = create_access_token(subject=str(user.id))
        new_refresh = create_refresh_token(subject=str(user.id))

        return TokenResponse(
            access_token=new_access,
            refresh_token=new_refresh,
            user=UserResponse.model_validate(user),
        )

    async def get_current_user(self, user_id: str) -> Optional[UserResponse]:
        user = await self.repo.get(user_id)
        if not user:
            return None
        return UserResponse.model_validate(user)
