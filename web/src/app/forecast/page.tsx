"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { qty, monthLabel } from "@/lib/format";
import { ForecastChart } from "@/components/Charts";
import { Empty, ErrorBox, Loading, PageHead } from "@/components/ui";

export default function ForecastPage() {
  const items = useLoad(() => api.items(), []);
  const [itemId, setItemId] = useState<number | null>(null);
  const [horizon, setHorizon] = useState(3);
  const [lead, setLead] = useState(7);

  useEffect(() => {
    if (itemId === null && items.data?.length) setItemId(items.data[0].id);
  }, [items.data, itemId]);

  const f = useLoad(() => (itemId === null ? Promise.resolve(null) : api.forecast(itemId, horizon, lead)), [itemId, horizon, lead]);
  const d = f.data;

  return (
    <>
      <PageHead title="Forecast" sub="Expected sales for the next months, worked out from your own sales bills. Needs at least 6 full months of bills for an item." />
      {items.loading && !items.data && <Loading slow={items.slow} />}
      {items.error && <ErrorBox error={items.error} onRetry={items.reload} />}
      {items.data && items.data.length === 0 && (
        <div className="panel"><Empty title="No items yet" action={<Link className="btn primary" href="/sales/new">Enter a sales bill</Link>}>Forecasts are built from sales bills.</Empty></div>
      )}
      {items.data && items.data.length > 0 && (
        <div className="stack">
          <div className="filters">
            <div><label className="f" htmlFor="fi">Item</label>
              <select id="fi" value={itemId ?? ""} onChange={(e) => setItemId(Number(e.target.value))}>{items.data.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
            <div><label className="f" htmlFor="fh">Months ahead</label>
              <select id="fh" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>{[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
            <div><label className="f" htmlFor="fl">Supplier delivery time (days)</label>
              <input id="fl" type="number" min={1} max={90} value={lead} onChange={(e) => setLead(Math.max(1, Number(e.target.value) || 1))} /></div>
          </div>

          {f.loading && <Loading slow={f.slow} />}
          {f.error && f.error.status === 422 && <div className="alert info" role="status">{f.error.message}</div>}
          {f.error && f.error.status !== 422 && <ErrorBox error={f.error} onRetry={f.reload} />}

          {d && !f.loading && !f.error && (
            <>
              <div className="panel figures">
                <div className="figure"><div className="label">Expected next month</div><div className="value">{qty(Math.round(d.forecast[0].qty))} {d.unit}</div><div className="note">Likely {qty(Math.round(d.forecast[0].lower))} to {qty(Math.round(d.forecast[0].upper))}</div></div>
                <div className="figure"><div className="label">In stock now</div><div className="value">{qty(d.on_hand)} {d.unit}</div><div className="note">{d.reorder.days_of_cover !== null ? `About ${Math.round(d.reorder.days_of_cover)} days of sales` : "No sales trend yet"}</div></div>
                <div className={`figure ${d.reorder.needs_reorder ? "warn" : "good"}`}><div className="label">{d.reorder.needs_reorder ? "Order now" : "Stock is enough"}</div><div className="value">{d.reorder.needs_reorder ? `${qty(Math.round(d.reorder.suggested_order_qty))} ${d.unit}` : "No order needed"}</div><div className="note">Reorder when stock falls to {qty(Math.round(d.reorder.reorder_point))} {d.unit}</div></div>
                <div className="figure"><div className="label">Forecast error</div><div className="value">{d.backtest.mape_model === null ? "Not enough data" : `${d.backtest.mape_model.toFixed(1)}%`}</div><div className="note">{d.backtest.mape_baseline === null ? "Needs about 27 months of bills" : `Same month last year would be off by ${d.backtest.mape_baseline.toFixed(1)}%`}</div></div>
              </div>
              <section className="panel">
                <header><h2>{d.item}: monthly sales</h2>
                  <div className="legend"><span><i style={{ background: "var(--ink)" }} />Past sales</span><span><i style={{ background: "var(--blue)" }} />Forecast</span></div></header>
                <div className="body"><ForecastChart history={d.history} forecast={d.forecast} unit={d.unit} /></div>
              </section>
              <section className="panel">
                <header><h2>What this means</h2></header>
                <div className="body"><p>{d.explanation}</p>
                  <p className="muted" style={{ marginTop: 8 }}>Built from {d.months_of_history} full months of sales bills. The running month is left out because it is not finished.</p></div>
              </section>
              <div className="panel scroll"><table className="ledger">
                <thead><tr><th>Month</th><th className="num">Expected ({d.unit})</th><th className="num">Low</th><th className="num">High</th></tr></thead>
                <tbody>{d.forecast.map((p) => <tr key={p.date}><td>{monthLabel(p.date.slice(0, 7))}</td><td className="num"><b>{qty(Math.round(p.qty))}</b></td><td className="num">{qty(Math.round(p.lower))}</td><td className="num">{qty(Math.round(p.upper))}</td></tr>)}</tbody>
              </table></div>
            </>
          )}
        </div>
      )}
    </>
  );
}
