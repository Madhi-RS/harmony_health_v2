import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_db, get_current_user, CurrentUser, DBDep
from app.models.appointment import AppointmentStatus
from app.schemas.appointment import (
    AppointmentCreate, AppointmentUpdate, AppointmentResponse,
    AppointmentListResponse, AppointmentStatusUpdate,
)
from app.services.appointment_service import AppointmentService

router = APIRouter(prefix="/appointments", tags=["Appointments"])


def get_appointment_service(
    db: DBDep,
    current_user: CurrentUser,
) -> AppointmentService:
    return AppointmentService(db, current_user)


@router.get("", response_model=AppointmentListResponse)
async def list_appointments(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    status: Optional[AppointmentStatus] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    patient_id: Optional[uuid.UUID] = Query(None),
    service: AppointmentService = Depends(get_appointment_service),
):
    """Get paginated list of appointments. Supports filtering."""
    return await service.list(
        page=page, size=size, status=status,
        date_from=date_from, date_to=date_to,
        patient_id=patient_id,
    )


@router.get("/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment(
    appointment_id: uuid.UUID,
    service: AppointmentService = Depends(get_appointment_service),
):
    """Get a single appointment by ID."""
    return await service.get(appointment_id)


@router.post("", response_model=AppointmentResponse, status_code=201)
async def create_appointment(
    data: AppointmentCreate,
    service: AppointmentService = Depends(get_appointment_service),
):
    """Create a new appointment."""
    return await service.create(data)


@router.put("/{appointment_id}", response_model=AppointmentResponse)
async def update_appointment(
    appointment_id: uuid.UUID,
    data: AppointmentUpdate,
    service: AppointmentService = Depends(get_appointment_service),
):
    """Update an existing appointment."""
    return await service.update(appointment_id, data)


@router.patch("/{appointment_id}/status", response_model=AppointmentResponse)
async def update_appointment_status(
    appointment_id: uuid.UUID,
    data: AppointmentStatusUpdate,
    service: AppointmentService = Depends(get_appointment_service),
):
    """Update appointment status with transition validation."""
    return await service.update_status(appointment_id, data)


@router.delete("/{appointment_id}", status_code=204)
async def delete_appointment(
    appointment_id: uuid.UUID,
    service: AppointmentService = Depends(get_appointment_service),
):
    """Delete an appointment. ADMIN only."""
    await service.delete(appointment_id)
