"""GET /patients/{id}/appointments — list appointments for a specific patient."""

import uuid
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from datetime import datetime
from app.api.deps import get_db, get_current_user, CurrentUser, DBDep
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.patient_repository import PatientRepository
from app.core.exceptions import NotFoundException
from app.models.appointment import AppointmentStatus

router = APIRouter(prefix="/patients", tags=["Patient Appointments"])


class PatientAppointmentResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    title: str
    appointment_date: datetime
    status: AppointmentStatus
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("/{patient_id}/appointments", response_model=list[PatientAppointmentResponse])
async def get_patient_appointments(
    patient_id: uuid.UUID,
    db: DBDep = None,
    current_user=Depends(get_current_user),
):
    """List appointments for a specific patient."""
    patient_repo = PatientRepository(db)
    patient = await patient_repo.get_active(patient_id)
    if not patient:
        raise NotFoundException("Patient", str(patient_id))

    appt_repo = AppointmentRepository(db)
    items, total = await appt_repo.list_by_patient(patient_id)
    return [PatientAppointmentResponse.model_validate(a) for a in items]
