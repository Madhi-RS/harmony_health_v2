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
        if payload.get("type") != "access":
            raise UnauthorizedException("Invalid token type")
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise UnauthorizedException("Invalid token payload")
    except JWTError:
        raise UnauthorizedException("Invalid or expired token")

    from app.repositories.user_repository import UserRepository
    repo = UserRepository(db)
    user = await repo.get(user_id)
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
