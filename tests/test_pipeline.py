from fastapi.testclient import TestClient

from app.api import app
from app.data import synthetic_sales, to_monthly, validate
from app.forecast import backtest, forecast_item, reorder_advice

client = TestClient(app)


def test_forecast_and_backtest():
    monthly = to_monthly(synthetic_sales())
    res = forecast_item(monthly, "Pepper", 3)
    assert len(res["forecast"]) == 3
    assert all(f["qty"] >= 0 and f["lower"] <= f["qty"] <= f["upper"] for f in res["forecast"])
    bt = res["backtest"]
    assert bt["mape_model"] < 40


def test_reorder_logic():
    low = reorder_advice(900, 1000, current_stock=50)
    assert low["needs_reorder"] and low["suggested_order_qty"] > 0
    high = reorder_advice(900, 1000, current_stock=5000)
    assert not high["needs_reorder"] and high["suggested_order_qty"] == 0


def test_validation_rejects_bad_columns():
    import pandas as pd
    try:
        validate(pd.DataFrame({"foo": [1]}))
        assert False
    except ValueError:
        pass


def test_api_endpoints():
    assert client.get("/health").json()["status"] == "ok"
    items = client.get("/items").json()
    assert "Pepper" in items
    r = client.get("/forecast/Pepper", params={"horizon": 2, "current_stock": 100})
    assert r.status_code == 200
    body = r.json()
    assert "reorder" in body and body["explanation"]
    assert client.get("/forecast/Nope").status_code == 404


def test_upload_csv():
    csv = "date,item,qty\n" + "\n".join(
        f"2024-{m:02d}-15,Ginger,{50+m}" for m in range(1, 13)
    ) + "\n" + "\n".join(f"2025-{m:02d}-15,Ginger,{60+m}" for m in range(1, 13))
    r = client.post("/upload", files={"file": ("sales.csv", csv.encode())})
    assert r.status_code == 200 and r.json()["items"] == ["Ginger"]
    assert client.get("/forecast/Ginger", params={"horizon": 1}).status_code == 200
    client.post("/reset-demo")
