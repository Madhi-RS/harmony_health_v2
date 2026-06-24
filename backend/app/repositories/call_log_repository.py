import uuid
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_log import CallLog, CallStatus, LatencyMetric, CostBreakdown
from app.repositories.base import BaseRepository


class CallLogRepository(BaseRepository[CallLog]):
    """Repository for call log analytics."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, CallLog)

    async def list_by_patient(self, patient_id: uuid.UUID, page: int = 1, size: int = 10):
        filters = [CallLog.patient_id == patient_id]
        return await self.get_all(page=page, size=size, filters=filters,
                                  order_by=[desc(CallLog.created_at)])

    async def list_completed(self, page: int = 1, size: int = 10):
        filters = [CallLog.status == CallStatus.COMPLETED]
        return await self.get_all(page=page, size=size, filters=filters,
                                  order_by=[desc(CallLog.created_at)])

    async def get_total_calls(self) -> int:
        stmt = select(func.count()).select_from(CallLog)
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def get_avg_duration(self) -> float:
        stmt = select(func.avg(CallLog.duration_seconds)).where(
            CallLog.duration_seconds.isnot(None)
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0.0

    async def get_transcript(self, call_id: uuid.UUID) -> str | None:
        stmt = select(CallLog.transcript).where(CallLog.id == call_id)
        result = await self.db.execute(stmt)
        return result.scalar()

    async def get_latency_metrics(self, call_id: uuid.UUID):
        stmt = (select(LatencyMetric)
                .where(LatencyMetric.call_id == call_id)
                .order_by(LatencyMetric.turn_number))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_cost_breakdown(self, call_id: uuid.UUID):
        stmt = select(CostBreakdown).where(CostBreakdown.call_id == call_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_total_cost(self) -> float:
        stmt = select(func.sum(CostBreakdown.total_cost)).select_from(CostBreakdown)
        result = await self.db.execute(stmt)
        return result.scalar() or 0.0


class LatencyRepository(BaseRepository[LatencyMetric]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, LatencyMetric)


class CostRepository(BaseRepository[CostBreakdown]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, CostBreakdown)
