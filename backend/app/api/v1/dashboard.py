from fastapi import APIRouter, Depends
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.api.deps import get_current_user, CurrentUser
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus
from app.models.conversation import Conversation

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def dashboard_stats(
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get real-time counts for dashboard cards."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # Total active patients
    patient_count = await db.scalar(
        select(func.count()).select_from(Patient).where(Patient.is_deleted == False)
    ) or 0

    # Today's appointments
    today_appts = await db.scalar(
        select(func.count()).select_from(Appointment).where(
            Appointment.appointment_date >= today_start,
            Appointment.appointment_date < today_start + timedelta(days=1),
        )
    ) or 0

    # Active conversations (updated in last 7 days)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    active_convs = await db.scalar(
        select(func.count()).select_from(Conversation).where(
            Conversation.updated_at >= week_ago,
        )
    ) or 0

    # Total appointments
    total_appts = await db.scalar(
        select(func.count()).select_from(Appointment)
    ) or 0

    # Scheduled appointments
    scheduled = await db.scalar(
        select(func.count()).select_from(Appointment).where(
            Appointment.status == AppointmentStatus.SCHEDULED,
        )
    ) or 0

    return {
        "total_patients": patient_count,
        "today_appointments": today_appts,
        "total_appointments": total_appts,
        "scheduled_appointments": scheduled,
        "active_conversations": active_convs,
    }
