"""FastAPI service: upload sales data, get forecasts + reorder advice."""
from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .data import load_bytes, synthetic_sales, to_monthly
from .forecast import forecast_item, reorder_advice
from .llm import llm_explain

app = FastAPI(title="Sales Forecasting API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# In-memory store (single-user demo). Swap for PostgreSQL later.
STATE: dict = {"monthly": to_monthly(synthetic_sales()), "source": "synthetic"}
CACHE: dict = {}  # (source, item, horizon) -> forecast result; cleared when data changes


@app.get("/health")
def health():
    return {"status": "ok", "source": STATE["source"]}


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    try:
        df = load_bytes(await file.read(), file.filename or "data.csv")
        STATE["monthly"] = to_monthly(df)
        STATE["source"] = file.filename
        CACHE.clear()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"items": sorted(STATE["monthly"]["item"].unique().tolist()),
            "months": int(STATE["monthly"]["date"].nunique())}


@app.post("/reset-demo")
def reset_demo():
    STATE["monthly"] = to_monthly(synthetic_sales())
    STATE["source"] = "synthetic"
    CACHE.clear()
    return {"status": "reset", "source": "synthetic"}


@app.get("/items")
def items():
    return sorted(STATE["monthly"]["item"].unique().tolist())


@app.get("/forecast/{item}")
def forecast(item: str, horizon: int = 3, current_stock: float | None = None,
             lead_time_days: int = 7, explain: bool = True):
    if not 1 <= horizon <= 12:
        raise HTTPException(status_code=400, detail="horizon must be 1-12")
    key = (STATE["source"], item, horizon)
    try:
        if key not in CACHE:
            CACHE[key] = forecast_item(STATE["monthly"], item, horizon)
        res = dict(CACHE[key])  # shallow copy so per-request fields don't leak into cache
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown item '{item}'")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    nxt = res["forecast"][0]
    if current_stock is not None:
        res["reorder"] = reorder_advice(nxt["qty"], nxt["upper"], current_stock, lead_time_days)
    if explain:
        res["explanation"] = llm_explain(item, res["history"], nxt, res["backtest"])
    return res
