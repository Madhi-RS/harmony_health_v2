import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment, AppointmentStatus
from app.repositories.base import BaseRepository


class AppointmentRepository(BaseRepository[Appointment]):
    """Repository for Appointment model with filtering."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Appointment)

    async def list_by_patient(
        self,
        patient_id: uuid.UUID,
        page: int = 1,
        size: int = 10,
    ) -> tuple[list[Appointment], int]:
        filters = [Appointment.patient_id == patient_id]
        return await self.get_all(
            page=page, size=size, filters=filters,
            order_by=[Appointment.appointment_date.desc()],
        )

    async def list_by_date_range(
        self,
        date_from: datetime,
        date_to: datetime,
        page: int = 1,
        size: int = 10,
    ) -> tuple[list[Appointment], int]:
        filters = [
            Appointment.appointment_date >= date_from,
            Appointment.appointment_date <= date_to,
        ]
        return await self.get_all(page=page, size=size, filters=filters)

    async def list_by_status(
        self,
        status: AppointmentStatus,
        page: int = 1,
        size: int = 10,
    ) -> tuple[list[Appointment], int]:
        filters = [Appointment.status == status]
        return await self.get_all(page=page, size=size, filters=filters)

    async def list_by_scheduler(
        self,
        user_id: uuid.UUID,
        page: int = 1,
        size: int = 10,
    ) -> tuple[list[Appointment], int]:
        filters = [Appointment.scheduled_by == user_id]
        return await self.get_all(
            page=page, size=size, filters=filters,
            order_by=[Appointment.appointment_date.desc()],
        )

    async def update_status(
        self, id: uuid.UUID, new_status: AppointmentStatus
    ) -> Optional[Appointment]:
        """Update appointment status with transition validation."""
        appointment = await self.get(id)
        if appointment is None:
            return None

        # Validate status transitions
        valid_transitions = {
            AppointmentStatus.SCHEDULED: [
                AppointmentStatus.COMPLETED,
                AppointmentStatus.CANCELLED,
            ],
            AppointmentStatus.COMPLETED: [
                AppointmentStatus.CANCELLED,
            ],
            AppointmentStatus.CANCELLED: [
                AppointmentStatus.SCHEDULED,
            ],
        }

        allowed = valid_transitions.get(appointment.status, [])
        if new_status not in allowed and appointment.status != new_status:
            raise ValueError(
                f"Cannot transition from '{appointment.status.value}' "
                f"to '{new_status.value}'. "
                f"Allowed transitions: {[s.value for s in allowed] or ['none']}"
            )

        appointment.status = new_status
        await self.db.flush()
        await self.db.refresh(appointment)
        return appointment
