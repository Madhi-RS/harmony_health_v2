import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException, ForbiddenException
from app.models.user import User, UserRole
from app.repositories.patient_repository import PatientRepository
from app.schemas.patient import (
    PatientCreate, PatientUpdate, PatientResponse, PatientListResponse,
)


class PatientService:
    """Handles patient CRUD with permission checks."""

    def __init__(self, db: AsyncSession, current_user: User):
        self.db = db
        self.repo = PatientRepository(db)
        self.current_user = current_user

    async def create(self, data: PatientCreate) -> PatientResponse:
        patient = await self.repo.create(
            first_name=data.first_name,
            last_name=data.last_name,
            date_of_birth=data.date_of_birth,
            gender=data.gender.upper() if data.gender else None,
            phone=data.phone,
            email=data.email.lower().strip() if data.email else None,
            address=data.address,
            medical_history=data.medical_history,
            created_by=self.current_user.id,
        )
        return PatientResponse.model_validate(patient)

    async def get(self, patient_id: uuid.UUID) -> PatientResponse:
        patient = await self.repo.get_active(patient_id)
        if patient is None:
            raise NotFoundException("Patient", str(patient_id))
        return PatientResponse.model_validate(patient)

    async def search(
        self,
        query: Optional[str] = None,
        page: int = 1,
        size: int = 10,
    ) -> PatientListResponse:
        if query:
            items, total = await self.repo.search(query, page=page, size=size)
        else:
            filters = [self.repo.model.is_deleted == False]
            items, total = await self.repo.get_all(
                page=page, size=size, filters=filters,
            )

        pages = max(1, (total + size - 1) // size)
        return PatientListResponse(
            items=[PatientResponse.model_validate(p) for p in items],
            total=total,
            page=page,
            size=size,
            pages=pages,
        )

    async def update(self, patient_id: uuid.UUID, data: PatientUpdate) -> PatientResponse:
        patient = await self.repo.get_active(patient_id)
        if patient is None:
            raise NotFoundException("Patient", str(patient_id))

        updated = await self.repo.update(
            patient_id,
            first_name=data.first_name,
            last_name=data.last_name,
            date_of_birth=data.date_of_birth,
            gender=data.gender.upper() if data.gender else None,
            phone=data.phone,
            email=data.email.lower().strip() if data.email else None,
            address=data.address,
            medical_history=data.medical_history,
        )
        return PatientResponse.model_validate(updated)

    async def delete(self, patient_id: uuid.UUID) -> None:
        patient = await self.repo.get_active(patient_id)
        if patient is None:
            raise NotFoundException("Patient", str(patient_id))

        # RBAC: RECEPTIONIST can only delete their own patients
        if (self.current_user.role == UserRole.RECEPTIONIST
                and str(patient.created_by) != str(self.current_user.id)):
            raise ForbiddenException(
                "Receptionists can only delete patients they created"
            )

        await self.repo.soft_delete(patient_id)
