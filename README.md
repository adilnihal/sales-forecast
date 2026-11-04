# Sales Forecasting Dashboard

Upload shop sales data (CSV/Excel) and get item-wise demand forecasts, reorder alerts and plain-language insights.

## Features
- Item-wise monthly forecast with 80% range (Holt-Winters), backtested against a seasonal-naive baseline (MAPE)
- Reorder advice from forecast, stock and supplier lead time
- Insight text: rule-based by default, Claude-generated if `ANTHROPIC_API_KEY` is set
- FastAPI backend + Streamlit dashboard, Dockerized

## Data format
CSV/Excel with columns: `date, item, qty` (daily or monthly rows both work).

## Run locally
```bash
pip install -r requirements.txt
uvicorn app.api:app --reload          # API  -> http://localhost:8000/docs
streamlit run dashboard.py            # UI   -> http://localhost:8501
pytest -q
```

## Run with Docker
```bash
export ANTHROPIC_API_KEY=...          # optional
docker compose up --build
```
- Dashboard: http://localhost:8501
- API docs: http://localhost:8000/docs

## Deploy (free-tier options)
- **Render / Railway:** two services from this repo. API start command: `uvicorn app.api:app --host 0.0.0.0 --port $PORT`. Dashboard start command: `streamlit run dashboard.py --server.port $PORT --server.address 0.0.0.0` with env `API_URL=<api public url>`.
- **AWS EC2:** `docker compose up -d` on a t3.small, open ports 8501/8000 in the security group.

## Roadmap
- Replace in-memory store with PostgreSQL
- LightGBM model + model comparison
- Auth, per-shop data isolation
- Replace synthetic data with real U.M.Traders sales

## Shop Ledger (billing frontend)

Next.js frontend (`web/`) on top of the API: type sales bills and purchase bills with rate and GST,
see stock and the GST summary, and get forecasts from your own bills.

Run everything: `docker compose up --build`, then open http://localhost:3000

- API: FastAPI + SQLAlchemy. `DATABASE_URL` selects PostgreSQL; without it a local SQLite file is used.
- Web: Next.js. `API_URL` points to the API (the browser only talks to the web service).
- "Load sample data" on the Overview page fills 3 years of demo bills (synthetic). Delete them before entering real data.

Render: create a PostgreSQL database, set `DATABASE_URL` (Internal URL) on the API service, then add a
Docker web service with root directory `web` and `API_URL` = the API's URL.
