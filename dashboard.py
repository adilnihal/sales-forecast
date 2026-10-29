"""Streamlit dashboard. Talks to the FastAPI service."""
import os

import pandas as pd
import plotly.graph_objects as go
import requests
import streamlit as st

API = os.getenv("API_URL", "http://localhost:8000")

def sample_rows(months: int = 12) -> pd.DataFrame:
    """Sample monthly sales (4 items x 12 months) to fill the manual-entry table."""
    import numpy as np

    rng = np.random.default_rng(7)
    end = pd.Timestamp.today().normalize().replace(day=1) - pd.offsets.MonthBegin(1)
    dates = pd.date_range(end=end, periods=months, freq="MS") + pd.Timedelta(days=14)
    base = {"Pepper": 1500, "Arecanut": 2500, "Rubber Sheet": 1400, "Coconut Oil": 900}
    rows = []
    for item, b in base.items():
        for i, d in enumerate(dates):
            season = 1 + 0.25 * np.cos(2 * np.pi * (d.month - 12) / 12)
            rows.append({"date": d, "item": item, "qty": float(round(b * season * rng.uniform(0.93, 1.07)))})
    return pd.DataFrame(rows)


st.set_page_config(page_title="Sales Forecast", page_icon="📈", layout="wide")
st.title("📈 Sales Forecasting Dashboard")

with st.sidebar:
    st.header("Data")
    up = st.file_uploader("Upload CSV/Excel (date, item, qty)", type=["csv", "xlsx"])
    if up and st.button("Use this file"):
        r = requests.post(f"{API}/upload", files={"file": (up.name, up.getvalue())})
        st.success(f"Loaded {r.json()}") if r.ok else st.error(r.json().get("detail"))
    if st.button("Reset to demo data"):
        requests.post(f"{API}/reset-demo")
        st.info("Demo data restored")
    st.divider()
    with st.expander("✍️ Type sales data manually"):
        st.caption("Add rows: date, item, qty. Need at least 6 months of data per item.")
        if "typed_df" not in st.session_state:
            st.session_state.typed_df = pd.DataFrame(
                {"date": [pd.Timestamp("2025-01-15")], "item": ["Pepper"], "qty": [100.0]}
            )
            st.session_state.typed_ver = 0
        if st.button("Auto-fill sample data"):
            st.session_state.typed_df = sample_rows()
            st.session_state.typed_ver += 1  # new key forces the table to reload
            st.rerun()
        typed = st.data_editor(
            st.session_state.typed_df,
            num_rows="dynamic",
            key=f"typed_rows_{st.session_state.typed_ver}",
            column_config={
                "date": st.column_config.DateColumn("Date", required=True),
                "item": st.column_config.TextColumn("Item", required=True),
                "qty": st.column_config.NumberColumn("Qty", min_value=0.0, required=True),
            },
        )
        if st.button("Use typed data"):
            clean = typed.dropna()
            if clean.empty:
                st.error("Add at least one row.")
            else:
                csv = clean.to_csv(index=False).encode()
                r = requests.post(f"{API}/upload", files={"file": ("typed.csv", csv)}, timeout=60)
                if r.ok:
                    st.success(f"Loaded {r.json()}")
                else:
                    st.error(r.json().get("detail", "Upload failed"))
    st.divider()
    horizon = st.slider("Forecast months", 1, 12, 3)
    stock = st.number_input("Current stock (units)", min_value=0.0, value=500.0, step=10.0)
    lead = st.number_input("Supplier lead time (days)", min_value=1, value=7)

def api_get(path, params=None, tries=3, timeout=45):
    """GET with retries: free-tier APIs sleep and take ~1 min to wake up."""
    last = None
    for _ in range(tries):
        try:
            return requests.get(f"{API}{path}", params=params, timeout=timeout)
        except requests.exceptions.RequestException as e:
            last = e
    raise last


try:
    with st.spinner("Waking up the API (free tier can take ~1 minute)..."):
        items = api_get("/items").json()
except Exception:
    st.error(f"Cannot reach API at {API}. Refresh in a minute.")
    st.stop()

item = st.selectbox("Item", items)
try:
    with st.spinner("Computing forecast..."):
        res = api_get(
            f"/forecast/{item}",
            params={"horizon": horizon, "current_stock": stock, "lead_time_days": lead},
        )
except Exception:
    st.error("API is slow to respond. Refresh in a minute.")
    st.stop()
if not res.ok:
    st.warning(res.json().get("detail"))
    st.stop()
d = res.json()

hist = pd.DataFrame(d["history"])
fc = pd.DataFrame(d["forecast"])
hist["date"] = pd.to_datetime(hist["date"])
fc["date"] = pd.to_datetime(fc["date"])

nxt = fc.iloc[0]
re = d.get("reorder", {})
c1, c2, c3, c4 = st.columns(4)
c1.metric("Next month forecast", f"{nxt['qty']:.0f}")
c2.metric("Likely range", f"{nxt['lower']:.0f} - {nxt['upper']:.0f}")
c3.metric("Days of cover", re.get("days_of_cover", "-"))
bt = d["backtest"]
if bt["mape_model"] is None:
    c4.metric("Model MAPE", "n/a", help="Needs ~15+ months of history to backtest accuracy")
else:
    c4.metric("Model MAPE", f"{bt['mape_model']:.1f}%",
              delta=f"{bt['improvement_pct']:.0f}% better than naive", delta_color="normal")

if re.get("needs_reorder"):
    st.error(f"⚠️ Reorder now. Suggested order: {re['suggested_order_qty']:.0f} units")
else:
    st.success(f"Stock OK. Reorder point: {re.get('reorder_point')} units")

fig = go.Figure()
fig.add_scatter(x=hist["date"], y=hist["qty"], name="Actual", mode="lines+markers")
fig.add_scatter(x=fc["date"], y=fc["upper"], mode="lines", line=dict(width=0), showlegend=False, hoverinfo="skip")
fig.add_scatter(x=fc["date"], y=fc["lower"], mode="lines", fill="tonexty", line=dict(width=0),
                name="80% range", fillcolor="rgba(255,127,14,0.2)")
fig.add_scatter(x=fc["date"], y=fc["qty"], name="Forecast", mode="lines+markers",
                line=dict(dash="dash"))
fig.update_layout(height=450, margin=dict(l=10, r=10, t=10, b=10), yaxis_title="Units / month")
st.plotly_chart(fig, width="stretch")

st.subheader("Insight")
st.write(d.get("explanation", ""))
