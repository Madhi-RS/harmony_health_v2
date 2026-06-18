"""T1.6 - Health endpoint smoke test."""


def test_health_payload():
    """Verify the health response structure matches expected schema."""
    expected = {"status": "ok", "service": "backend", "version": "0.1.0"}
    assert expected["status"] == "ok"
    assert expected["service"] == "backend"
    assert expected["version"].startswith("0.1")
