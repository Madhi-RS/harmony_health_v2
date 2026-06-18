import uuid
from typing import Optional
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import Patient
from app.repositories.base import BaseRepository


class PatientRepository(BaseRepository[Patient]):
    """Repository for Patient model with search and soft-delete."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Patient)

    async def search(
        self,
        query: str,
        page: int = 1,
        size: int = 10,
        include_deleted: bool = False,
    ) -> tuple[list[Patient], int]:
        """Search patients by name, phone, or email with pagination."""
        filters = []
        if not include_deleted:
            filters.append(Patient.is_deleted == False)

        if query:
            search_filter = or_(
                Patient.first_name.ilike(f"%{query}%"),
                Patient.last_name.ilike(f"%{query}%"),
                Patient.phone.ilike(f"%{query}%"),
                Patient.email.ilike(f"%{query}%"),
            )
            filters.append(search_filter)

        return await self.get_all(page=page, size=size, filters=filters)

    async def find_by_phone(self, phone: str) -> Optional[Patient]:
        stmt = select(Patient).where(Patient.phone == phone)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_email(self, email: str) -> Optional[Patient]:
        stmt = select(Patient).where(Patient.email == email.lower().strip())
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def soft_delete(self, id: uuid.UUID) -> bool:
        """Soft-delete a patient by setting is_deleted=True."""
        patient = await self.get(id)
        if patient is None:
            return False
        patient.is_deleted = True
        await self.db.flush()
        return True

    async def get_active(self, id: uuid.UUID) -> Optional[Patient]:
        """Get a patient that is not soft-deleted."""
        stmt = select(Patient).where(
            Patient.id == id,
            Patient.is_deleted == False,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
