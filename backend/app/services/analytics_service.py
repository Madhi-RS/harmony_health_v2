import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.repositories.call_log_repository import CallLogRepository


class AnalyticsService:
    """Provides call analytics, latency tracking, and cost breakdowns."""

    def __init__(self, db: AsyncSession):
        self.repo = CallLogRepository(db)

    async def list_calls(self, page: int = 1, size: int = 10) -> dict:
        items, total = await self.repo.list_completed(page=page, size=size)
        avg_duration = await self.repo.get_avg_duration()
        total_cost = await self.repo.get_total_cost()
        total_calls = await self.repo.get_total_calls()

        return {
            "items": items,
            "total": total,
            "page": page,
            "size": size,
            "summary": {
                "total_calls": total_calls,
                "avg_duration_seconds": round(avg_duration, 1),
                "total_cost_usd": round(total_cost, 4),
            },
        }

    async def get_call(self, call_id: uuid.UUID) -> dict:
        call = await self.repo.get(call_id)
        if call is None:
            raise NotFoundException("CallLog", str(call_id))
        return {
            "call": call,
            "latency_metrics": await self.repo.get_latency_metrics(call_id),
            "cost_breakdown": await self.repo.get_cost_breakdown(call_id),
        }

    async def get_transcript(self, call_id: uuid.UUID) -> dict:
        call = await self.repo.get(call_id)
        if call is None:
            raise NotFoundException("CallLog", str(call_id))
        return {
            "call_id": str(call.id),
            "transcript": call.transcript or "",
            "summary": call.summary or "",
            "duration_seconds": call.duration_seconds or 0,
        }

    async def get_latency(self, call_id: uuid.UUID) -> dict:
        call = await self.repo.get(call_id)
        if call is None:
            raise NotFoundException("CallLog", str(call_id))
        metrics = await self.repo.get_latency_metrics(call_id)
        avg_stt = sum(m.stt_latency_ms or 0 for m in metrics) / max(len(metrics), 1)
        avg_llm = sum(m.llm_latency_ms or 0 for m in metrics) / max(len(metrics), 1)
        avg_tts = sum(m.tts_latency_ms or 0 for m in metrics) / max(len(metrics), 1)

        return {
            "call_id": str(call.id),
            "turns": len(metrics),
            "metrics": metrics,
            "averages": {
                "stt_ms": round(avg_stt, 1),
                "llm_ms": round(avg_llm, 1),
                "tts_ms": round(avg_tts, 1),
            },
        }

    async def get_cost(self, call_id: uuid.UUID) -> dict:
        cost = await self.repo.get_cost_breakdown(call_id)
        if cost is None:
            return {
                "call_id": str(call_id),
                "stt_cost": 0.0,
                "llm_cost": 0.0,
                "tts_cost": 0.0,
                "total_cost": 0.0,
                "currency": "USD",
            }
        return {
            "call_id": str(cost.call_id),
            "stt_cost": cost.stt_cost,
            "llm_cost": cost.llm_cost,
            "tts_cost": cost.tts_cost,
            "total_cost": cost.total_cost,
            "currency": cost.currency,
        }

    async def get_turns(self, call_id: uuid.UUID) -> dict:
        """Get per-turn breakdown combining latency and cost data."""
        call = await self.repo.get(call_id)
        if call is None:
            raise NotFoundException("CallLog", str(call_id))

        metrics = await self.repo.get_latency_metrics(call_id)
        cost = await self.repo.get_cost_breakdown(call_id)

        turns = []
        for m in metrics:
            turn_cost = None
            if cost:
                per_turn = cost.total_cost / max(len(metrics), 1)
                turn_cost = {
                    "stt_cost": round(cost.stt_cost / max(len(metrics), 1), 6),
                    "llm_cost": round(cost.llm_cost / max(len(metrics), 1), 6),
                    "tts_cost": round(cost.tts_cost / max(len(metrics), 1), 6),
                    "total_cost": round(per_turn, 6),
                    "currency": cost.currency,
                }

            turns.append({
                "turn_number": m.turn_number,
                "stt_latency_ms": m.stt_latency_ms,
                "llm_latency_ms": m.llm_latency_ms,
                "tts_latency_ms": m.tts_latency_ms,
                "total_latency_ms": m.total_latency_ms,
                "cost": turn_cost,
            })

        return {
            "call_id": str(call.id),
            "total_turns": len(turns),
            "duration_seconds": call.duration_seconds or 0,
            "turns": turns,
        }
