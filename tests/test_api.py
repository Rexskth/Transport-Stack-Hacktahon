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


def _route_stop_ids(route, positions):
    import pandas as pd
    rs = pd.read_csv("data/processed/route_stops.csv", dtype={"stop_id": str})
    r = rs[rs.route_short_name == route].sort_values("pos").reset_index(drop=True)
    return [r.stop_id[i] for i in positions]


def test_journeys_direct_route_found_and_fields(client):
    a, b = _route_stop_ids("717AUP", [0, 40])
    r = client.get("/journeys", params={"from": a, "to": b, "depart": "08:30"}).json()
    assert r["options"], r
    opts = r["options"]
    assert any(o["routes"] == ["717AUP"] for o in opts)
    o = opts[0]
    assert o["crowding"]["level"] in ("seats", "standing", "crowded", "unknown")
    assert o["crowding"]["confidence"] in ("low", "medium", "high")
    assert o["total_minutes"] > 0 and o["legs"][0]["path"]
    assert [x["total_minutes"] for x in opts] == sorted(x["total_minutes"] for x in opts)   # fast = by time


def test_journeys_comfort_orders_by_crowding_then_time(client):
    a, b = _route_stop_ids("717AUP", [0, 40])
    r = client.get("/journeys", params={"from": a, "to": b, "depart": "08:30", "prefer": "comfort"}).json()
    rank = {"seats": 0, "standing": 1, "crowded": 2, "unknown": 1}
    key = [(1 if o["crowding"]["confidence"] == "low" else rank[o["crowding"]["level"]], o["total_minutes"]) for o in r["options"]]
    assert key == sorted(key)


def test_journeys_coordinates_and_errors(client):
    r = client.get("/journeys", params={"from": "28.6692,77.2278", "to": "28.5355,77.2641", "depart": "09:00"}).json()
    assert r["origin"] and r["destination"]
    assert client.get("/journeys", params={"from": "999999999", "to": "1"}).status_code == 422
    assert client.get("/journeys", params={"from": "1", "to": "2", "depart": "25:99"}).status_code == 422
    assert client.get("/journeys", params={"from": "0,0", "to": "1"}).status_code == 422     # no stop within walking distance


def test_journeys_no_service_late_night_is_explained(client):
    a, b = _route_stop_ids("717AUP", [0, 40])
    r = client.get("/journeys", params={"from": a, "to": b, "depart": "23:55"}).json()
    assert r["options"] == [] and r["note"]
