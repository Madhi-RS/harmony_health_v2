from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.patients import router as patients_router
from app.api.v1.appointments import router as appointments_router
from app.api.v1.conversations import router as conversations_router
from app.api.v1.chat import router as chat_router
from app.api.v1.dashboard import router as dashboard_router

router = APIRouter(prefix="/api/v1")

router.include_router(auth_router)
router.include_router(patients_router)
router.include_router(appointments_router)
router.include_router(conversations_router)
router.include_router(chat_router)
router.include_router(dashboard_router)
