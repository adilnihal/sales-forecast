"""Streamlit dashboard. Talks to the FastAPI service."""
import os

import pandas as pd
import plotly.graph_objects as go
import requests
import streamlit as st

API = os.getenv("API_URL", "http://localhost:8000")

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
    horizon = st.slider("Forecast months", 1, 12, 3)
    stock = st.number_input("Current stock (units)", min_value=0.0, value=500.0, step=10.0)
    lead = st.number_input("Supplier lead time (days)", min_value=1, value=7)

try:
    items = requests.get(f"{API}/items", timeout=10).json()
except Exception:
    st.error(f"Cannot reach API at {API}")
    st.stop()

item = st.selectbox("Item", items)
res = requests.get(
    f"{API}/forecast/{item}",
    params={"horizon": horizon, "current_stock": stock, "lead_time_days": lead},
    timeout=60,
)
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
c4.metric("Model MAPE", f"{bt['mape_model']:.1f}%",
          delta=f"{bt['improvement_pct']:.0f}% better than naive", delta_color="normal")

if re.get("needs_reorder"):
    st.error(f"⚠️ Reorder now. Suggested order: {re['suggested_order_qty']:.0f} units")
else:
    st.success(f"Stock OK. Reorder point: {re.get('reorder_point')} units")

fig = go.Figure()
fig.add_scatter(x=hist["date"], y=hist["qty"], name="Actual", mode="lines+markers")
fig.add_scatter(x=fc["date"], y=fc["upper"], line=dict(width=0), showlegend=False, hoverinfo="skip")
fig.add_scatter(x=fc["date"], y=fc["lower"], fill="tonexty", line=dict(width=0),
                name="80% range", fillcolor="rgba(255,127,14,0.2)")
fig.add_scatter(x=fc["date"], y=fc["qty"], name="Forecast", mode="lines+markers",
                line=dict(dash="dash"))
fig.update_layout(height=450, margin=dict(l=10, r=10, t=10, b=10), yaxis_title="Units / month")
st.plotly_chart(fig, use_container_width=True)

st.subheader("Insight")
st.write(d.get("explanation", ""))
