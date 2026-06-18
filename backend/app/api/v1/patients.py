import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_db, get_current_user, CurrentUser, DBDep
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse, PatientListResponse
from app.services.patient_service import PatientService

router = APIRouter(prefix="/patients", tags=["Patients"])


def get_patient_service(
    db: DBDep,
    current_user: CurrentUser,
) -> PatientService:
    return PatientService(db, current_user)


@router.get("", response_model=PatientListResponse)
async def list_patients(
    query: Optional[str] = Query(None, description="Search by name, phone, or email"),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    service: PatientService = Depends(get_patient_service),
):
    """Get paginated list of patients. Supports search."""
    return await service.search(query=query, page=page, size=size)


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: uuid.UUID,
    service: PatientService = Depends(get_patient_service),
):
    """Get a single patient by ID."""
    return await service.get(patient_id)


@router.post("", response_model=PatientResponse, status_code=201)
async def create_patient(
    data: PatientCreate,
    service: PatientService = Depends(get_patient_service),
):
    """Create a new patient."""
    return await service.create(data)


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: uuid.UUID,
    data: PatientUpdate,
    service: PatientService = Depends(get_patient_service),
):
    """Update an existing patient."""
    return await service.update(patient_id, data)


@router.delete("/{patient_id}", status_code=204)
async def delete_patient(
    patient_id: uuid.UUID,
    service: PatientService = Depends(get_patient_service),
):
    """Soft-delete a patient. RECEPTIONIST can only delete own patients."""
    await service.delete(patient_id)
