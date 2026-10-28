"""Data loading, validation and synthetic data generation."""
from __future__ import annotations

import io

import numpy as np
import pandas as pd

REQUIRED_COLS = ["date", "item", "qty"]


def load_sales(file_or_path) -> pd.DataFrame:
    """Load CSV/Excel with columns: date, item, qty (price and stock optional)."""
    name = getattr(file_or_path, "name", str(file_or_path)).lower()
    if name.endswith((".xlsx", ".xls")):
        df = pd.read_excel(file_or_path)
    else:
        df = pd.read_csv(file_or_path)
    return validate(df)


def load_bytes(content: bytes, filename: str) -> pd.DataFrame:
    buf = io.BytesIO(content)
    buf.name = filename
    return load_sales(buf)


def validate(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [c.strip().lower() for c in df.columns]
    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}. Required: {REQUIRED_COLS}")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["qty"] = pd.to_numeric(df["qty"], errors="coerce")
    df = df.dropna(subset=["date", "item", "qty"])
    df = df[df["qty"] >= 0]
    df["item"] = df["item"].astype(str).str.strip()
    if df.empty:
        raise ValueError("No valid rows after cleaning.")
    return df


def to_monthly(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate to month-start totals per item, filling gaps with 0."""
    m = (
        df.set_index("date")
        .groupby("item")["qty"]
        .resample("MS")
        .sum()
        .reset_index()
    )
    full = []
    for item, g in m.groupby("item"):
        idx = pd.date_range(g["date"].min(), g["date"].max(), freq="MS")
        s = g.set_index("date")["qty"].reindex(idx, fill_value=0.0)
        full.append(pd.DataFrame({"date": idx, "item": item, "qty": s.values}))
    return pd.concat(full, ignore_index=True)


def synthetic_sales(months: int = 36, seed: int = 42) -> pd.DataFrame:
    """Fake shop data (kg sold per day) with trend + seasonality per item."""
    rng = np.random.default_rng(seed)
    end = pd.Timestamp.today().normalize().replace(day=1) - pd.Timedelta(days=1)
    days = pd.date_range(end - pd.DateOffset(months=months) + pd.Timedelta(days=1), end)
    items = {
        # base kg/day, yearly trend, seasonal amplitude, peak month
        "Pepper": (40, 0.10, 0.35, 12),
        "Arecanut": (70, 0.05, 0.20, 10),
        "Rubber Sheet": (55, -0.03, 0.25, 7),
        "Coconut Oil": (30, 0.15, 0.30, 4),
    }
    rows = []
    t = np.arange(len(days)) / 365.0
    for item, (base, trend, amp, peak) in items.items():
        season = 1 + amp * np.cos(2 * np.pi * (days.month - peak) / 12)
        mean = base * (1 + trend * t) * season
        qty = rng.poisson(np.clip(mean, 1, None)).astype(float)
        rows.append(pd.DataFrame({"date": days, "item": item, "qty": qty}))
    return pd.concat(rows, ignore_index=True)
