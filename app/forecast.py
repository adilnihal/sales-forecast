"""Forecasting models, backtesting and reorder logic."""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing

SEASON = 12


def seasonal_naive(y: pd.Series, h: int) -> np.ndarray:
    """Baseline: same month last year (falls back to last value)."""
    vals = y.values
    if len(vals) >= SEASON:
        return np.array([vals[-SEASON + (i % SEASON)] for i in range(h)])
    return np.repeat(vals[-1], h)


def holt_winters(y: pd.Series, h: int) -> tuple[np.ndarray, np.ndarray]:
    """Return (forecast, residual_std). Needs >= 2 seasons for seasonality."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if len(y) >= 2 * SEASON:
            model = ExponentialSmoothing(
                y.values, trend="add", seasonal="add",
                seasonal_periods=SEASON, initialization_method="estimated",
            ).fit()
        else:
            model = ExponentialSmoothing(
                y.values, trend="add", initialization_method="estimated"
            ).fit()
    fc = np.clip(model.forecast(h), 0, None)
    resid_std = float(np.std(model.resid)) if len(model.resid) else 0.0
    return fc, np.repeat(resid_std, h)


def mape(actual: np.ndarray, pred: np.ndarray) -> float:
    mask = actual > 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((actual[mask] - pred[mask]) / actual[mask])) * 100)


def backtest(y: pd.Series, horizon: int = 3, folds: int = 3) -> dict:
    """Rolling-origin backtest comparing Holt-Winters vs seasonal naive."""
    hw_err, nv_err = [], []
    for k in range(folds, 0, -1):
        cut = len(y) - k * horizon
        if cut < SEASON + 2:
            continue
        train, test = y.iloc[:cut], y.iloc[cut: cut + horizon].values
        if len(test) < horizon:
            continue
        hw_err.append(mape(test, holt_winters(train, horizon)[0]))
        nv_err.append(mape(test, seasonal_naive(train, horizon)))
    hw = float(np.nanmean(hw_err)) if hw_err else float("nan")
    nv = float(np.nanmean(nv_err)) if nv_err else float("nan")
    improvement = (nv - hw) / nv * 100 if nv and not np.isnan(nv) and not np.isnan(hw) else float("nan")
    # JSON cannot hold NaN: report "not enough data to backtest" as None
    clean = lambda x: None if x is None or np.isnan(x) else float(x)
    return {"mape_model": clean(hw), "mape_baseline": clean(nv), "improvement_pct": clean(improvement)}


def forecast_item(monthly: pd.DataFrame, item: str, horizon: int = 1) -> dict:
    g = monthly[monthly["item"] == item].sort_values("date")
    if g.empty:
        raise KeyError(item)
    y = pd.Series(g["qty"].values, index=g["date"])
    if len(y) < 6:
        raise ValueError(f"'{item}' needs at least 6 months of data (has {len(y)}).")
    fc, sd = holt_winters(y, horizon)
    future = pd.date_range(y.index[-1] + pd.offsets.MonthBegin(1), periods=horizon, freq="MS")
    z = 1.28  # ~80% interval
    return {
        "item": item,
        "history": [{"date": d.strftime("%Y-%m-%d"), "qty": float(v)} for d, v in y.items()],
        "forecast": [
            {
                "date": d.strftime("%Y-%m-%d"),
                "qty": float(f),
                "lower": float(max(f - z * s, 0)),
                "upper": float(f + z * s),
            }
            for d, f, s in zip(future, fc, sd)
        ],
        "backtest": backtest(y),
    }


def reorder_advice(next_month_forecast: float, upper: float, current_stock: float,
                   lead_time_days: int = 7) -> dict:
    """Simple reorder rule: cover lead time demand + safety buffer (upper - mean)."""
    daily = next_month_forecast / 30.0
    lead_demand = daily * lead_time_days
    safety = max(upper - next_month_forecast, 0) / 30.0 * lead_time_days
    reorder_point = lead_demand + safety
    target = next_month_forecast + safety
    order_qty = max(target - current_stock, 0)
    days_cover = current_stock / daily if daily > 0 else float("inf")
    return {
        "reorder_point": round(reorder_point, 1),
        "days_of_cover": round(days_cover, 1) if np.isfinite(days_cover) else None,
        "needs_reorder": bool(current_stock <= reorder_point),
        "suggested_order_qty": round(order_qty, 1),
    }


def explain(item: str, hist: list[dict], fc: dict) -> str:
    """Rule-based explanation (works offline). LLM version lives in llm.py."""
    last = hist[-1]["qty"]
    change = (fc["qty"] - last) / last * 100 if last else 0
    ly = next((h["qty"] for h in hist if h["date"][:7] == _shift_year(fc["date"])), None)
    parts = [f"{item}: next month ~{fc['qty']:.0f} units ({change:+.0f}% vs last month)."]
    if ly:
        yoy = (fc["qty"] - ly) / ly * 100 if ly else 0
        parts.append(f"{yoy:+.0f}% vs the same month last year.")
    parts.append(f"Likely range {fc['lower']:.0f}-{fc['upper']:.0f}.")
    return " ".join(parts)


def _shift_year(date_str: str) -> str:
    d = pd.Timestamp(date_str) - pd.DateOffset(years=1)
    return d.strftime("%Y-%m")
