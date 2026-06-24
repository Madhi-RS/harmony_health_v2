from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.patients import router as patients_router
from app.api.v1.appointments import router as appointments_router
from app.api.v1.conversations import router as conversations_router
from app.api.v1.chat import router as chat_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.voice import router as voice_router
from app.api.v1.users import router as users_router
from app.api.v1.patient_appointments import router as patient_appts_router
from app.api.v1.chat_stream import router as chat_stream_router
from app.api.v1.livekit_api import router as livekit_router

router = APIRouter(prefix="/api/v1")

router.include_router(auth_router)
router.include_router(patients_router)
router.include_router(patient_appts_router)  # GET /patients/{id}/appointments
router.include_router(appointments_router)
router.include_router(conversations_router)
router.include_router(chat_router)
router.include_router(chat_stream_router)    # POST /chat/stream
router.include_router(dashboard_router)
router.include_router(analytics_router)
router.include_router(voice_router)          # POST /voice/sync
router.include_router(users_router)          # GET/POST/PUT/PATCH/DELETE /users
router.include_router(livekit_router)        # POST /livekit/*
