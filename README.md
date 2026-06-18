# Harmony Health — Patient Management System

A production-ready Patient Management System (PMS) with an AI-powered receptionist assistant.

## Architecture

```
Frontend (Next.js 15)
    │
    ▼
Backend API (FastAPI)
    │
    ├── Authentication
    ├── Patients
    ├── Appointments
    ├── Conversations
    └── AI Gateway → External AI Service (Gemini / RAG / Qdrant)

Voice Service
    │
    ├── LiveKit (Real-Time Audio)
    ├── FasterWhisper (STT)
    └── Piper (TTS)

PostgreSQL
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui |
| State | Zustand + TanStack Query |
| Backend | FastAPI, Python 3.13, SQLAlchemy, Alembic |
| Database | PostgreSQL 16 |
| Voice | LiveKit, FasterWhisper, Piper |
| Auth | JWT (access + refresh tokens), bcrypt, RBAC |

## Prerequisites

- Python 3.12+
- Node.js 20+
- Docker & Docker Compose (for full stack)
- PostgreSQL 16 (for local dev without Docker)

## Quick Start (Development)

### 1. Backend

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 3. Full Stack with Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/v1/         # API endpoints
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── repositories/   # Data access layer
│   │   ├── services/       # Business logic
│   │   ├── core/           # Config, security, exceptions
│   │   └── main.py         # FastAPI app
│   ├── alembic/            # DB migrations
│   ├── tests/
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js pages
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API client code
│   │   ├── stores/         # Zustand stores
│   │   ├── lib/            # Utilities
│   │   └── types/          # TypeScript types
│   └── Dockerfile
├── voice-service/
│   ├── app/
│   │   ├── stt.py          # FasterWhisper
│   │   ├── tts.py          # Piper
│   │   ├── livekit_service.py
│   │   ├── orchestrator.py
│   │   └── main.py
│   ├── tests/
│   └── Dockerfile
├── docker/
├── docker-compose.yml
└── docker-compose.dev.yml
```
