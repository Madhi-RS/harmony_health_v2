from typing import Annotated, Any
from fastapi import Depends, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.security import decode_token
from app.core.exceptions import UnauthorizedException, ForbiddenException
from app.models.user import User, UserRole

security_scheme = HTTPBearer(auto_error=False)

DBDep = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
    db: DBDep,
) -> User:
    if credentials is None:
        raise UnauthorizedException("Not authenticated")

    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise UnauthorizedException("Invalid or expired token")

    # CarePlus tokens: have userId but no sub or type
    is_careplus = "userId" in payload and "sub" not in payload

    if is_careplus:
        user_id = payload["userId"]
    else:
        if payload.get("type") != "access":
            raise UnauthorizedException("Invalid token type")
        user_id = payload.get("sub", "")
        if not user_id:
            raise UnauthorizedException("Invalid token payload")

    from app.repositories.user_repository import UserRepository
    from app.core.security import hash_password

    repo = UserRepository(db)
    user = await repo.get(user_id)

    if user is None and is_careplus:
        # Auto-create user from CarePlus token claims
        email = payload.get("email", "careplus@unknown.com")
        user = await repo.create(
            id=user_id,
            email=email,
            username=email.split("@")[0],
            password_hash=hash_password("careplus-sso"),
            role=UserRole.RECEPTIONIST,
            is_active=True,
        )
        await db.commit()

    if user is None:
        raise UnauthorizedException("User not found")
    if not user.is_active:
        raise ForbiddenException("User account is disabled")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


class RoleChecker:
    def __init__(self, allowed_roles: list[UserRole]):
        self.allowed_roles = allowed_roles

    async def __call__(self, current_user: CurrentUser) -> User:
        if current_user.role not in self.allowed_roles:
            raise ForbiddenException(
                f"Role '{current_user.role.value}' not allowed. Requires: {[r.value for r in self.allowed_roles]}"
            )
        return current_user


async def get_internal_api_key(
    x_internal_api_key: Annotated[str | None, Header()] = None,
) -> str:
    from app.core.config import settings

    if x_internal_api_key is None or x_internal_api_key != settings.VOICE_SYNC_API_KEY:
        raise ForbiddenException("Invalid internal API key")
    return x_internal_api_key
