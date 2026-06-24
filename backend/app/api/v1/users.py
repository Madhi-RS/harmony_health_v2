"""Admin-only user management endpoints."""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_db, get_current_user, CurrentUser, DBDep, RoleChecker
from app.models.user import UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserUpdate, UserResponse, TokenResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/users", tags=["Users"])

admin_only = RoleChecker([UserRole.ADMIN])


@router.get("", response_model=list[UserResponse])
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: DBDep = None,
    current_user=Depends(admin_only),
):
    """List all users (ADMIN only)."""
    repo = UserRepository(db)
    items, total = await repo.get_all(page=page, size=size)
    return [UserResponse.model_validate(u) for u in items]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    db: DBDep = None,
    current_user=Depends(admin_only),
):
    """Get a user by ID (ADMIN only)."""
    from app.core.exceptions import NotFoundException
    repo = UserRepository(db)
    user = await repo.get(user_id)
    if not user:
        raise NotFoundException("User", str(user_id))
    return UserResponse.model_validate(user)


@router.post("", response_model=TokenResponse, status_code=201)
async def create_user(
    data: UserCreate,
    db: DBDep = None,
    current_user=Depends(admin_only),
):
    """Create a new user (ADMIN only). Returns tokens."""
    service = AuthService(db)
    return await service.register(data)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    db: DBDep = None,
    current_user=Depends(admin_only),
):
    """Update a user (ADMIN only)."""
    from app.core.exceptions import NotFoundException
    repo = UserRepository(db)
    user = await repo.update(user_id, **data.model_dump(exclude_none=True))
    if not user:
        raise NotFoundException("User", str(user_id))
    return UserResponse.model_validate(user)


@router.patch("/{user_id}/disable", response_model=UserResponse)
async def disable_user(
    user_id: uuid.UUID,
    db: DBDep = None,
    current_user=Depends(admin_only),
):
    """Disable a user account (ADMIN only)."""
    from app.core.exceptions import NotFoundException
    repo = UserRepository(db)
    user = await repo.update(user_id, is_active=False)
    if not user:
        raise NotFoundException("User", str(user_id))
    return UserResponse.model_validate(user)


@router.patch("/{user_id}/enable", response_model=UserResponse)
async def enable_user(
    user_id: uuid.UUID,
    db: DBDep = None,
    current_user=Depends(admin_only),
):
    """Enable a user account (ADMIN only)."""
    from app.core.exceptions import NotFoundException
    repo = UserRepository(db)
    user = await repo.update(user_id, is_active=True)
    if not user:
        raise NotFoundException("User", str(user_id))
    return UserResponse.model_validate(user)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    db: DBDep = None,
    current_user=Depends(admin_only),
):
    """Delete a user (ADMIN only)."""
    from app.core.exceptions import NotFoundException
    repo = UserRepository(db)
    deleted = await repo.delete(user_id)
    if not deleted:
        raise NotFoundException("User", str(user_id))
