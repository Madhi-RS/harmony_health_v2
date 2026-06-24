import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_db, get_current_user, CurrentUser, DBDep
from app.models.user import User, UserRole
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["Analytics"])

# Reusable admin-only dependency that is evaluated before each endpoint
RequireAdmin = Annotated[User, Depends(lambda current_user: _enforce_admin(current_user))]


def _enforce_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        from app.core.exceptions import ForbiddenException
        raise ForbiddenException(
            f"Analytics access requires ADMIN role. Your role: {current_user.role.value}"
        )
    return current_user


def get_analytics_service(db: DBDep) -> AnalyticsService:
    return AnalyticsService(db)


@router.get("/calls")
async def list_calls(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    service: AnalyticsService = Depends(get_analytics_service),
    _admin: User = Depends(_enforce_admin),
):
    """List completed calls with summary stats (ADMIN only)."""
    return await service.list_calls(page=page, size=size)


@router.get("/calls/{call_id}")
async def get_call(
    call_id: uuid.UUID,
    service: AnalyticsService = Depends(get_analytics_service),
    _admin: User = Depends(_enforce_admin),
):
    """Get call details with latency metrics and cost breakdown (ADMIN only)."""
    return await service.get_call(call_id)


@router.get("/calls/{call_id}/transcript")
async def get_call_transcript(
    call_id: uuid.UUID,
    service: AnalyticsService = Depends(get_analytics_service),
    _admin: User = Depends(_enforce_admin),
):
    """Get call transcript and summary (ADMIN only)."""
    return await service.get_transcript(call_id)


@router.get("/calls/{call_id}/cost")
async def get_call_cost(
    call_id: uuid.UUID,
    service: AnalyticsService = Depends(get_analytics_service),
    _admin: User = Depends(_enforce_admin),
):
    """Get per-call cost breakdown (ADMIN only)."""
    return await service.get_cost(call_id)


@router.get("/calls/{call_id}/latency")
async def get_call_latency(
    call_id: uuid.UUID,
    service: AnalyticsService = Depends(get_analytics_service),
    _admin: User = Depends(_enforce_admin),
):
    """Get per-turn latency metrics (ADMIN only)."""
    return await service.get_latency(call_id)
