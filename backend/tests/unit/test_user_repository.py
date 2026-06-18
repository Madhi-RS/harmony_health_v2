"""T2.1-T2.7 — UserRepository unit tests."""

import pytest
import uuid

from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.core.security import hash_password


class TestUserRepository:
    """Tests for UserRepository CRUD operations."""

    @pytest.mark.asyncio
    async def test_create_user(self, db_session):
        """T2.1 — Create user with all fields."""
        repo = UserRepository(db_session)
        user = await repo.create(
            email="test@example.com",
            username="testuser",
            password_hash=hash_password("SecurePass123!"),
            role=UserRole.RECEPTIONIST,
        )
        assert user.id is not None
        assert user.email == "test@example.com"
        assert user.username == "testuser"
        assert user.role == UserRole.RECEPTIONIST
        assert user.is_active is True
        assert user.created_at is not None

    @pytest.mark.asyncio
    async def test_find_by_email(self, db_session):
        """T2.2 — Find user by email."""
        repo = UserRepository(db_session)
        # Create user
        await repo.create(
            email="findme@example.com",
            username="finduser",
            password_hash=hash_password("Pass123!"),
            role=UserRole.ADMIN,
        )
        # Find by email
        found = await repo.find_by_email("findme@example.com")
        assert found is not None
        assert found.email == "findme@example.com"
        assert found.role == UserRole.ADMIN

        # Missing email returns None
        not_found = await repo.find_by_email("nonexistent@example.com")
        assert not_found is None

    @pytest.mark.asyncio
    async def test_find_by_username(self, db_session):
        """T2.3 — Find user by username."""
        repo = UserRepository(db_session)
        await repo.create(
            email="user@example.com",
            username="unique_user",
            password_hash=hash_password("Pass123!"),
        )
        found = await repo.find_by_username("unique_user")
        assert found is not None
        assert found.username == "unique_user"

        not_found = await repo.find_by_username("nobody")
        assert not_found is None

    @pytest.mark.asyncio
    async def test_get_all_paginated(self, db_session):
        """T2.4 — Paginated get_all."""
        repo = UserRepository(db_session)
        # Create 5 users
        for i in range(5):
            await repo.create(
                email=f"user{i}@example.com",
                username=f"user{i}",
                password_hash=hash_password("Pass123!"),
            )

        # Get first page with size 2
        items, total = await repo.get_all(page=1, size=2)
        assert len(items) == 2
        assert total == 5

        # Get second page
        items2, total2 = await repo.get_all(page=2, size=2)
        assert len(items2) == 2
        assert total2 == 5

    @pytest.mark.asyncio
    async def test_get_by_uuid(self, db_session):
        """T2.5 — Get user by UUID."""
        repo = UserRepository(db_session)
        user = await repo.create(
            email="gettest@example.com",
            username="getuser",
            password_hash=hash_password("Pass123!"),
        )
        found = await repo.get(user.id)
        assert found is not None
        assert found.id == user.id

        # Non-existent UUID
        missing = await repo.get(uuid.uuid4())
        assert missing is None

    @pytest.mark.asyncio
    async def test_update_user(self, db_session):
        """T2.6 — Update user fields."""
        repo = UserRepository(db_session)
        user = await repo.create(
            email="updatable@example.com",
            username="updateuser",
            password_hash=hash_password("OldPass123!"),
        )
        updated = await repo.update(user.id, username="updated_username")
        assert updated is not None
        assert updated.username == "updated_username"
        assert updated.email == "updatable@example.com"  # Unchanged

    @pytest.mark.asyncio
    async def test_delete_user(self, db_session):
        """T2.7 — Delete user."""
        repo = UserRepository(db_session)
        user = await repo.create(
            email="deletable@example.com",
            username="deleteuser",
            password_hash=hash_password("Pass123!"),
        )
        deleted = await repo.delete(user.id)
        assert deleted is True

        # Should not be found
        found = await repo.get(user.id)
        assert found is None
