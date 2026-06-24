"""T-analytics — Analytics module unit and integration tests."""

import pytest
import uuid
from datetime import datetime, timezone

from app.models.call_log import CallLog, CallStatus, CallDirection, LatencyMetric, CostBreakdown
from app.repositories.call_log_repository import CallLogRepository


class TestCallLogRepository:
    """Tests for call log analytics CRUD."""

    @pytest.mark.asyncio
    async def test_create_call_log(self, db_session):
        """Create call log with all fields."""
        repo = CallLogRepository(db_session)
        call = await repo.create(
            direction=CallDirection.INBOUND,
            status=CallStatus.COMPLETED,
            caller_number="+1234567890",
            duration_seconds=120.5,
            transcript="Hello, I need an appointment.",
            summary="Patient requested appointment booking.",
            started_at=datetime.now(timezone.utc),
            ended_at=datetime.now(timezone.utc),
        )
        assert call.id is not None
        assert call.direction == CallDirection.INBOUND
        assert call.status == CallStatus.COMPLETED
        assert call.duration_seconds == 120.5

    @pytest.mark.asyncio
    async def test_list_completed_calls(self, db_session):
        """List only completed calls."""
        repo = CallLogRepository(db_session)
        await repo.create(status=CallStatus.COMPLETED, duration_seconds=60.0)
        await repo.create(status=CallStatus.INITIATED, duration_seconds=0)
        await repo.create(status=CallStatus.COMPLETED, duration_seconds=90.0)

        items, total = await repo.list_completed()
        assert total == 2
        assert all(c.status == CallStatus.COMPLETED for c in items)

    @pytest.mark.asyncio
    async def test_get_total_calls(self, db_session):
        """Total call count works."""
        repo = CallLogRepository(db_session)
        for i in range(3):
            await repo.create(status=CallStatus.COMPLETED)

        count = await repo.get_total_calls()
        assert count == 3

    @pytest.mark.asyncio
    async def test_get_avg_duration(self, db_session):
        """Average duration calculation."""
        repo = CallLogRepository(db_session)
        await repo.create(status=CallStatus.COMPLETED, duration_seconds=100.0)
        await repo.create(status=CallStatus.COMPLETED, duration_seconds=200.0)

        avg = await repo.get_avg_duration()
        assert avg == 150.0

    @pytest.mark.asyncio
    async def test_latency_metrics(self, db_session):
        """Latency metrics stored per call."""
        repo = CallLogRepository(db_session)
        call = await repo.create(status=CallStatus.COMPLETED)

        from app.repositories.call_log_repository import LatencyRepository
        lat_repo = LatencyRepository(db_session)
        await lat_repo.create(
            call_id=call.id, turn_number=1,
            stt_latency_ms=100.0, llm_latency_ms=500.0, tts_latency_ms=200.0,
            total_latency_ms=800.0,
        )
        await lat_repo.create(
            call_id=call.id, turn_number=2,
            stt_latency_ms=120.0, llm_latency_ms=480.0, tts_latency_ms=180.0,
            total_latency_ms=780.0,
        )

        metrics = await repo.get_latency_metrics(call.id)
        assert len(metrics) == 2
        assert metrics[0].turn_number == 1

    @pytest.mark.asyncio
    async def test_cost_breakdown(self, db_session):
        """Cost breakdown stored per call."""
        repo = CallLogRepository(db_session)
        call = await repo.create(status=CallStatus.COMPLETED)

        from app.repositories.call_log_repository import CostRepository
        cost_repo = CostRepository(db_session)
        await cost_repo.create(
            call_id=call.id,
            stt_cost=0.002, llm_cost=0.010, tts_cost=0.003,
            total_cost=0.015, currency="USD",
        )

        cost = await repo.get_cost_breakdown(call.id)
        assert cost is not None
        assert cost.total_cost == 0.015
        assert cost.currency == "USD"

    @pytest.mark.asyncio
    async def test_get_transcript(self, db_session):
        """Transcript retrieval."""
        repo = CallLogRepository(db_session)
        call = await repo.create(
            status=CallStatus.COMPLETED,
            transcript="User: Hi\nAI: Hello!",
            summary="Greeting exchange",
        )

        transcript = await repo.get_transcript(call.id)
        assert "Hi" in transcript
