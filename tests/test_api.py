"""API tests. Need data/processed/ from run_pipeline.py; skipped if missing. Run: pytest -q"""
import pathlib
import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(not pathlib.Path("data/processed/crowding.csv.gz").exists(),
                                reason="run scripts/build_gtfs_tables.py and run_pipeline.py first")


@pytest.fixture(scope="module")
def client():
    from api.main import app
    with TestClient(app) as c:
        yield c


def test_health_and_meta(client):
    assert client.get("/health").json()["status"] == "ok"
    m = client.get("/meta").json()
    assert m["levels"]["names"] == ["seats", "standing", "crowded"]
    assert "ticket_sample_rate" in m["assumptions"]


def test_routes_search(client):
    r = client.get("/routes", params={"q": "717A"}).json()
    assert r["count"] > 0 and any(x["route"] == "717AUP" for x in r["routes"])


def test_crowding_route_order_and_fields(client):
    r = client.get("/crowding", params={"route": "717AUP", "hour": 18}).json()
    s = r["stretches"]
    assert s and [x["stretch"] for x in s] == sorted(x["stretch"] for x in s)
    assert {x["level"] for x in s} <= {"seats", "standing", "crowded"}
    assert all(x["confidence"] in ("low", "medium", "high") for x in s)


def test_validation_errors(client):
    assert client.get("/crowding", params={"route": "NOPE", "hour": 9}).status_code == 404
    assert client.get("/crowding", params={"route": "717AUP", "hour": 24}).status_code == 422
    assert client.get("/heatmap", params={"hour": 9, "min_confidence": "x"}).status_code == 422


def test_heatmap_sorted_and_filtered(client):
    h = client.get("/heatmap", params={"hour": 18, "min_confidence": "high", "limit": 10}).json()
    idx = [x["index"] for x in h["items"]]
    assert h["count"] > 0 and idx == sorted(idx, reverse=True)
    st = client.get("/heatmap", params={"hour": 18, "by": "stretch", "min_confidence": "medium"}).json()
    assert all(x["confidence"] in ("medium", "high") for x in st["items"])


def test_profile_peaks_in_expected_hours(client):
    p = client.get("/routes/717AUP/profile").json()["hours"]
    top = max(p, key=lambda x: x["riders_per_bus"])["hour"]
    assert 7 <= top <= 21


def test_stops_search(client):
    r = client.get("/stops", params={"q": "kashmere"}).json()
    assert r["count"] > 0 and all("kashmere" in x["stop_name"].lower() for x in r["stops"])
