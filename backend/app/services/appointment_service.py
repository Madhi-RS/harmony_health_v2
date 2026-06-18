import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException
from app.models.user import User, UserRole
from app.models.appointment import AppointmentStatus
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.patient_repository import PatientRepository
from app.schemas.appointment import (
    AppointmentCreate, AppointmentUpdate, AppointmentResponse,
    AppointmentListResponse, AppointmentStatusUpdate,
)


class AppointmentService:
    """Handles appointment CRUD with status transitions and RBAC."""

    def __init__(self, db: AsyncSession, current_user: User):
        self.db = db
        self.repo = AppointmentRepository(db)
        self.patient_repo = PatientRepository(db)
        self.current_user = current_user

    async def create(self, data: AppointmentCreate) -> AppointmentResponse:
        # Validate patient exists
        patient = await self.patient_repo.get_active(data.patient_id)
        if patient is None:
            raise NotFoundException("Patient", str(data.patient_id))

        appointment = await self.repo.create(
            patient_id=data.patient_id,
            scheduled_by=self.current_user.id,
            title=data.title,
            description=data.description,
            appointment_date=data.appointment_date,
            notes=data.notes,
        )
        return AppointmentResponse.model_validate(appointment)

    async def get(self, appointment_id: uuid.UUID) -> AppointmentResponse:
        appointment = await self.repo.get(appointment_id)
        if appointment is None:
            raise NotFoundException("Appointment", str(appointment_id))
        return AppointmentResponse.model_validate(appointment)

    async def list(
        self,
        page: int = 1,
        size: int = 10,
        status: Optional[AppointmentStatus] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        patient_id: Optional[uuid.UUID] = None,
    ) -> AppointmentListResponse:
        filters = []

        if status:
            filters.append(self.repo.model.status == status)
        if date_from:
            filters.append(self.repo.model.appointment_date >= date_from)
        if date_to:
            filters.append(self.repo.model.appointment_date <= date_to)
        if patient_id:
            filters.append(self.repo.model.patient_id == patient_id)

        # RBAC: RECEPTIONIST can only see their own appointments
        if self.current_user.role == UserRole.RECEPTIONIST:
            filters.append(self.repo.model.scheduled_by == self.current_user.id)

        items, total = await self.repo.get_all(
            page=page, size=size, filters=filters,
        )
        pages = max(1, (total + size - 1) // size)
        return AppointmentListResponse(
            items=[AppointmentResponse.model_validate(a) for a in items],
            total=total,
            page=page,
            size=size,
            pages=pages,
        )

    async def update(self, appointment_id: uuid.UUID, data: AppointmentUpdate) -> AppointmentResponse:
        appointment = await self.repo.get(appointment_id)
        if appointment is None:
            raise NotFoundException("Appointment", str(appointment_id))

        # RBAC check
        self._check_ownership(appointment)

        # If patient_id is being changed, validate it exists
        if data.patient_id and data.patient_id != appointment.patient_id:
            patient = await self.patient_repo.get_active(data.patient_id)
            if patient is None:
                raise NotFoundException("Patient", str(data.patient_id))

        updated = await self.repo.update(
            appointment_id,
            title=data.title,
            description=data.description,
            appointment_date=data.appointment_date,
            notes=data.notes,
            patient_id=data.patient_id,
        )
        return AppointmentResponse.model_validate(updated)

    async def update_status(
        self, appointment_id: uuid.UUID, data: AppointmentStatusUpdate
    ) -> AppointmentResponse:
        appointment = await self.repo.get(appointment_id)
        if appointment is None:
            raise NotFoundException("Appointment", str(appointment_id))

        # RBAC check
        self._check_ownership(appointment)

        try:
            updated = await self.repo.update_status(appointment_id, data.status)
        except ValueError as e:
            raise ValidationException(str(e))
        return AppointmentResponse.model_validate(updated)

    async def delete(self, appointment_id: uuid.UUID) -> None:
        appointment = await self.repo.get(appointment_id)
        if appointment is None:
            raise NotFoundException("Appointment", str(appointment_id))

        # RBAC: Only ADMIN can delete appointments
        if self.current_user.role != UserRole.ADMIN:
            raise ForbiddenException("Only admins can delete appointments")

        await self.repo.delete(appointment_id)

    def _check_ownership(self, appointment) -> None:
        """RECEPTIONIST can only modify their own appointments."""
        if (self.current_user.role == UserRole.RECEPTIONIST
                and str(appointment.scheduled_by) != str(self.current_user.id)):
            raise ForbiddenException(
                "Receptionists can only modify their own appointments"
            )
