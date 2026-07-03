import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import router as voice_router
from app.orchestrator import VoiceOrchestrator

# ── Configure logging so agent_worker output reaches the terminal ──
logging.basicConfig(
    level=logging.INFO,
    format="[%(name)s] %(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
    force=True,
)
# Also capture uvicorn logs at INFO so we see everything
logging.getLogger("uvicorn").setLevel(logging.INFO)
logging.getLogger("agent_worker").setLevel(logging.DEBUG)
logging.getLogger("voice_api").setLevel(logging.DEBUG)

# Global orchestrator instance (used by API and tests)
orchestrator = VoiceOrchestrator()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — ensure models are available
    try:
        orchestrator.ensure_models()
    except Exception as e:
        print(f"Warning: Voice models not loaded: {e}")
        print("The voice service will start but STT/TTS may not work until models are placed.")
    yield
    # Shutdown — nothing to clean up


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include voice API routes
app.include_router(voice_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "voice-service", "version": settings.APP_VERSION}
