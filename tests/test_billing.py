import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app.api import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean():
    client.post("/v1/demo/clear", params={"confirm": "yes"})
    yield
    client.post("/v1/demo/clear", params={"confirm": "yes"})


def sale(lines, party="Ravi Stores", date="2026-10-05", **kw):
    return client.post("/v1/bills", json={"bill_type": "sale", "date": date, "party_name": party, "lines": lines, **kw})


def purchase(lines, party="Wayanad Co-op", date="2026-10-01", **kw):
    return client.post("/v1/bills", json={"bill_type": "purchase", "date": date, "party_name": party, "lines": lines, **kw})


def test_bill_totals_and_auto_numbers():
    r = sale([
        {"item_name": "Pepper", "qty": 10, "rate": 600, "gst_percent": 5},
        {"item_name": "Rubber Sheet", "qty": 5, "rate": 190.5, "gst_percent": 12},
    ])
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["taxable"] == 6952.5          # 6000 + 952.5
    assert b["gst"] == 414.3               # 300 + 114.3
    assert b["total"] == 7366.8
    assert b["number"].startswith("S-") and b["line_count"] == 2
    # items and party were created on the fly
    assert {i["name"] for i in client.get("/v1/items").json()} == {"Pepper", "Rubber Sheet"}
    assert client.get("/v1/parties", params={"kind": "customer"}).json()[0]["name"] == "Ravi Stores"


def test_stock_and_gst_flow():
    assert purchase([{"item_name": "Pepper", "qty": 100, "rate": 500, "gst_percent": 5}]).status_code == 201
    assert sale([{"item_name": "pepper", "qty": 30, "rate": 600, "gst_percent": 5}]).status_code == 201  # case-insensitive

    row = next(s for s in client.get("/v1/stock").json() if s["name"] == "Pepper")
    assert row["purchased_qty"] == 100 and row["sold_qty"] == 30 and row["on_hand"] == 70
    assert row["avg_purchase_rate"] == 500 and row["last_sale_rate"] == 600
    assert row["stock_value"] == 35000 and row["status"] == "ok"

    g = client.get("/v1/gst/summary").json()
    assert g["output_tax"] == 900          # 30*600*5%
    assert g["input_tax"] == 2500          # 100*500*5%
    assert g["net_payable"] == -1600       # 900 - 2500: input credit
    assert g["split"]["cgst_output"] == 450
    assert g["by_rate"][0]["gst_percent"] == 5
    assert client.get("/v1/gst/summary", params={"month": "2026-10"}).json()["output_tax"] == 900
    assert client.get("/v1/gst/summary", params={"month": "2026-09"}).json()["output_tax"] == 0


def test_low_stock_status_and_item_patch():
    purchase([{"item_name": "Arecanut", "qty": 50, "rate": 400, "gst_percent": 5}])
    item = client.get("/v1/items").json()[0]
    r = client.patch(f"/v1/items/{item['id']}", json={"reorder_level": 80, "hsn": "0802"})
    assert r.status_code == 200 and r.json()["hsn"] == "0802"
    assert client.get("/v1/stock").json()[0]["status"] == "low"
    sale([{"item_name": "Arecanut", "qty": 80, "rate": 450, "gst_percent": 5}])
    assert client.get("/v1/stock").json()[0]["status"] == "negative"


def test_validation_and_errors():
    assert sale([{"item_name": "Pepper", "qty": 0, "rate": 10}]).status_code == 422          # qty must be > 0
    assert sale([{"item_name": "Pepper", "qty": 1, "rate": -1}]).status_code == 422          # no negative rate
    assert sale([]).status_code == 422                                                       # needs a line
    assert client.post("/v1/bills", json={"bill_type": "purchase", "date": "2026-10-01",
                                          "lines": [{"item_name": "X", "qty": 1, "rate": 1}]}).status_code == 422  # supplier required
    assert client.get("/v1/bills/9999").status_code == 404
    assert client.get("/v1/gst/summary", params={"month": "oct"}).status_code == 400
    assert client.post("/v1/items", json={"name": "Pepper"}).status_code == 201
    assert client.post("/v1/items", json={"name": "pepper"}).status_code == 409
    assert client.post("/v1/demo/clear").status_code == 400  # needs confirm


def test_walkin_customer_and_delete():
    b = client.post("/v1/bills", json={"bill_type": "sale", "date": "2026-10-02",
                                       "lines": [{"item_name": "Pepper", "qty": 2, "rate": 600, "gst_percent": 5}]}).json()
    assert b["party_name"] == "Walk-in customer"
    assert client.delete(f"/v1/bills/{b['id']}").status_code == 204
    assert client.get("/v1/bills").json() == []
    assert client.get("/v1/stock").json()[0]["on_hand"] == 0


def test_demo_seed_forecast_and_dashboard():
    assert client.post("/v1/demo/seed").status_code == 201
    assert client.post("/v1/demo/seed").status_code == 409     # already has data
    d = client.get("/v1/dashboard").json()
    assert len(d["monthly"]) == 12 and d["bill_counts"]["sale"] > 50
    assert d["sales_this_month"] >= 0 and "recent_bills" in d
    items = client.get("/v1/items").json()
    pepper = next(i for i in items if i["name"] == "Pepper")
    assert pepper["last_sale_rate"] and pepper["last_purchase_rate"]
    f = client.get(f"/v1/forecast/{pepper['id']}", params={"horizon": 3})
    assert f.status_code == 200, f.text
    body = f.json()
    assert len(body["forecast"]) == 3 and body["months_of_history"] >= 12
    assert "reorder" in body and body["explanation"]
    # forecast must not use the running (incomplete) month
    this_month = dt.date.today().strftime("%Y-%m")
    assert all(h["date"][:7] != this_month for h in body["history"])


def test_forecast_needs_history():
    sale([{"item_name": "Ginger", "qty": 5, "rate": 100, "gst_percent": 5}])
    gid = client.get("/v1/items").json()[0]["id"]
    r = client.get(f"/v1/forecast/{gid}")
    assert r.status_code == 422 and "6 full months" in r.json()["detail"]
    assert client.get("/v1/forecast/9999").status_code == 404
