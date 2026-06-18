"""T3.5-T3.8 — AppointmentRepository unit tests."""

import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timedelta, timezone

from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User, UserRole
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.patient_repository import PatientRepository
from app.repositories.user_repository import UserRepository
from app.core.security import hash_password


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user for FK references."""
    repo = UserRepository(db_session)
    return await repo.create(
        email="appt_test@example.com",
        username="appt_tester",
        password_hash=hash_password("TestPass123!"),
        role=UserRole.RECEPTIONIST,
    )


@pytest_asyncio.fixture
async def test_patient(db_session):
    """Create a test patient for FK references."""
    repo = PatientRepository(db_session)
    return await repo.create(first_name="Test", last_name="Patient")


class TestAppointmentRepository:
    """Tests for AppointmentRepository filtering and status transitions."""

    @pytest.mark.asyncio
    async def test_create_appointment(self, db_session, test_user, test_patient):
        """T3.5 — Create appointment with patient + scheduler FKs."""
        repo = AppointmentRepository(db_session)
        appt = await repo.create(
            patient_id=test_patient.id,
            scheduled_by=test_user.id,
            title="Checkup",
            appointment_date=datetime.now(timezone.utc) + timedelta(days=1),
        )
        assert appt.id is not None
        assert appt.title == "Checkup"
        assert appt.status == AppointmentStatus.SCHEDULED

    @pytest.mark.asyncio
    async def test_list_by_date_range(self, db_session, test_user, test_patient):
        """T3.6 — Filter appointments by date range."""
        repo = AppointmentRepository(db_session)
        now = datetime.now(timezone.utc)
        await repo.create(
            patient_id=test_patient.id, scheduled_by=test_user.id,
            title="Today", appointment_date=now,
        )
        await repo.create(
            patient_id=test_patient.id, scheduled_by=test_user.id,
            title="Tomorrow", appointment_date=now + timedelta(days=1),
        )
        await repo.create(
            patient_id=test_patient.id, scheduled_by=test_user.id,
            title="Next Week", appointment_date=now + timedelta(days=7),
        )

        items, total = await repo.list_by_date_range(
            now, now + timedelta(hours=23, minutes=59),
        )
        assert total == 1
        assert items[0].title == "Today"

    @pytest.mark.asyncio
    async def test_list_by_status(self, db_session, test_user, test_patient):
        """T3.7 — Filter appointments by status."""
        repo = AppointmentRepository(db_session)
        now = datetime.now(timezone.utc)
        for i in range(3):
            await repo.create(
                patient_id=test_patient.id, scheduled_by=test_user.id,
                title=f"Appt {i}", appointment_date=now + timedelta(days=i),
            )

        items, total = await repo.list_by_status(AppointmentStatus.SCHEDULED)
        assert total == 3

    @pytest.mark.asyncio
    async def test_list_by_scheduler(self, db_session, test_user, test_patient):
        """T3.8 — Filter by scheduler user."""
        repo = AppointmentRepository(db_session)
        user_b = await UserRepository(db_session).create(
            email="user_b@test.com", username="user_b",
            password_hash=hash_password("Pass123!"), role=UserRole.RECEPTIONIST,
        )

        now = datetime.now(timezone.utc)
        for i in range(3):
            await repo.create(
                patient_id=test_patient.id, scheduled_by=test_user.id,
                title=f"A-{i}", appointment_date=now + timedelta(days=i),
            )
        await repo.create(
            patient_id=test_patient.id, scheduled_by=user_b.id,
            title="B-only", appointment_date=now + timedelta(days=1),
        )

        items_a, total_a = await repo.list_by_scheduler(test_user.id)
        assert total_a == 3

        items_b, total_b = await repo.list_by_scheduler(user_b.id)
        assert total_b == 1

    @pytest.mark.asyncio
    async def test_status_transition_scheduled_to_completed(
        self, db_session, test_user, test_patient,
    ):
        """T3.13 — SCHEDULED -> COMPLETED allowed."""
        repo = AppointmentRepository(db_session)
        appt = await repo.create(
            patient_id=test_patient.id, scheduled_by=test_user.id,
            title="Transition Test",
            appointment_date=datetime.now(timezone.utc),
        )
        updated = await repo.update_status(appt.id, AppointmentStatus.COMPLETED)
        assert updated.status == AppointmentStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_status_transition_completed_to_scheduled_rejected(
        self, db_session, test_user, test_patient,
    ):
        """T3.17 — COMPLETED -> SCHEDULED rejected."""
        repo = AppointmentRepository(db_session)
        appt = await repo.create(
            patient_id=test_patient.id, scheduled_by=test_user.id,
            title="Bad Transition",
            appointment_date=datetime.now(timezone.utc),
            status=AppointmentStatus.COMPLETED,
        )
        with pytest.raises(ValueError, match="Cannot transition"):
            await repo.update_status(appt.id, AppointmentStatus.SCHEDULED)
