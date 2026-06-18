import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.models.appointment import AppointmentStatus


class AppointmentCreate(BaseModel):
    patient_id: uuid.UUID
    title: str
    description: Optional[str] = None
    appointment_date: datetime
    notes: Optional[str] = None


class AppointmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    appointment_date: Optional[datetime] = None
    notes: Optional[str] = None
    patient_id: Optional[uuid.UUID] = None


class AppointmentStatusUpdate(BaseModel):
    status: AppointmentStatus


class AppointmentResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    scheduled_by: uuid.UUID
    title: str
    description: Optional[str] = None
    appointment_date: datetime
    status: AppointmentStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AppointmentListResponse(BaseModel):
    items: list[AppointmentResponse]
    total: int
    page: int
    size: int
    pages: int
