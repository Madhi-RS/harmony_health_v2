import uuid
from typing import Optional
from sqlalchemy import select

from app.database import Base
from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for User model with auth-specific queries."""

    def __init__(self, db):
        super().__init__(db, User)

    async def find_by_email(self, email: str) -> Optional[User]:
        stmt = select(User).where(User.email == email.lower().strip())
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_username(self, username: str) -> Optional[User]:
        stmt = select(User).where(User.username == username.strip())
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def find_active_by_email(self, email: str) -> Optional[User]:
        stmt = select(User).where(
            User.email == email.lower().strip(),
            User.is_active == True,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
