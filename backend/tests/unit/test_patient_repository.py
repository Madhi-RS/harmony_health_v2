"""T3.1-T3.4 — PatientRepository unit tests."""

import pytest
import uuid
from app.models.patient import Patient
from app.models.user import User, UserRole
from app.repositories.patient_repository import PatientRepository
from app.core.security import hash_password


class TestPatientRepository:
    """Tests for PatientRepository CRUD and search operations."""

    @pytest.mark.asyncio
    async def test_create_patient(self, db_session):
        """T3.1 — Create patient with all fields."""
        repo = PatientRepository(db_session)
        patient = await repo.create(
            first_name="John",
            last_name="Doe",
            phone="+1234567890",
            email="john@example.com",
        )
        assert patient.id is not None
        assert patient.first_name == "John"
        assert patient.last_name == "Doe"
        assert patient.is_deleted is False

    @pytest.mark.asyncio
    async def test_search_by_name(self, db_session):
        """T3.2 — Search patients by name."""
        repo = PatientRepository(db_session)
        await repo.create(first_name="Alice", last_name="Smith")
        await repo.create(first_name="Bob", last_name="Jones")
        await repo.create(first_name="Albert", last_name="Brown")

        items, total = await repo.search(query="Ali")
        assert total == 1
        assert items[0].first_name == "Alice"

        items, total = await repo.search(query="Bob")
        assert total == 1

    @pytest.mark.asyncio
    async def test_search_by_phone(self, db_session):
        """T3.2 — Search patients by phone."""
        repo = PatientRepository(db_session)
        await repo.create(first_name="Test", last_name="User", phone="555-0100")

        items, total = await repo.search(query="555-0100")
        assert total == 1

    @pytest.mark.asyncio
    async def test_search_empty_result(self, db_session):
        """T3.13 — Non-matching search returns empty list."""
        repo = PatientRepository(db_session)
        items, total = await repo.search(query="NonexistentNameXYZ")
        assert total == 0
        assert len(items) == 0

    @pytest.mark.asyncio
    async def test_pagination(self, db_session):
        """T3.3 — Paginated get_all works."""
        repo = PatientRepository(db_session)
        for i in range(5):
            await repo.create(
                first_name=f"User{i}", last_name="Test",
            )

        items, total = await repo.get_all(page=1, size=2)
        assert len(items) == 2
        assert total == 5

        items2, total2 = await repo.get_all(page=3, size=2)
        assert len(items2) == 1  # 5th item on page 3
        assert total2 == 5

    @pytest.mark.asyncio
    async def test_soft_delete(self, db_session):
        """T3.4 — Soft-delete sets is_deleted=True."""
        repo = PatientRepository(db_session)
        patient = await repo.create(first_name="Delete", last_name="Me")

        result = await repo.soft_delete(patient.id)
        assert result is True

        # Should not be found by get_active
        found = await repo.get_active(patient.id)
        assert found is None

        # Should still be found by regular get
        found = await repo.get(patient.id)
        assert found is not None
        assert found.is_deleted is True

    @pytest.mark.asyncio
    async def test_get_active_excludes_deleted(self, db_session):
        """T3.4 — Default search excludes soft-deleted patients."""
        repo = PatientRepository(db_session)
        p1 = await repo.create(first_name="Active", last_name="User")
        p2 = await repo.create(first_name="Deleted", last_name="User")
        await repo.soft_delete(p2.id)

        items, total = await repo.search(query="User")
        assert total == 1
        assert items[0].id == p1.id
