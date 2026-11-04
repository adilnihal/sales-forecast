"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { dateLabel, inr, inrWhole, monthLabel, qty } from "@/lib/format";
import { MonthlyBars } from "@/components/Charts";
import { Empty, ErrorBox, Loading, PageHead, StatusBadge } from "@/components/ui";

export default function Overview() {
  const { data, error, loading, slow, reload } = useLoad(() => api.dashboard(), []);
  const [busy, setBusy] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  const seed = async () => {
    setBusy(true);
    setSeedError(null);
    try {
      await api.seedDemo();
      reload();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "Could not add sample data.");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!window.confirm("Delete ALL bills, items and parties? This cannot be undone.")) return;
    setBusy(true);
    try {
      await api.clearAll();
      reload();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "Could not clear data.");
    } finally {
      setBusy(false);
    }
  };

  const empty = data && data.bill_counts.sale + data.bill_counts.purchase === 0;

  return (
    <>
      <PageHead title="Overview" sub={data ? `${monthLabel(data.month)} so far` : undefined}>
        <Link className="btn primary" href="/sales/new">New sales bill</Link>
        <Link className="btn" href="/purchases/new">New purchase bill</Link>
      </PageHead>

      {loading && !data && <Loading slow={slow} />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {seedError && <div className="alert error" role="alert">{seedError}</div>}

      {empty && (
        <div className="panel">
          <Empty
            title="No bills yet"
            action={
              <>
                <Link className="btn primary" href="/sales/new">Enter your first sales bill</Link>
                <button className="btn" onClick={seed} disabled={busy}>{busy ? "Adding…" : "Fill with sample data"}</button>
              </>
            }
          >
            Type in a sales or purchase bill, or fill the app with a year of sample bills to see how stock, GST and the forecast work.
          </Empty>
        </div>
      )}

      {data && !empty && (
        <div className="stack">
          <div className="panel figures">
            <div className="figure"><div className="label">Sales this month</div><div className="value">{inrWhole(data.sales_this_month)}</div><div className="note">{data.bill_counts.sale} sales bills in total</div></div>
            <div className="figure"><div className="label">Purchases this month</div><div className="value">{inrWhole(data.purchases_this_month)}</div><div className="note">{data.bill_counts.purchase} purchase bills in total</div></div>
            <div className={`figure ${data.gst_net_this_month > 0 ? "warn" : "good"}`}>
              <div className="label">{data.gst_net_this_month > 0 ? "GST to pay this month" : "GST credit this month"}</div>
              <div className="value">{inrWhole(Math.abs(data.gst_net_this_month))}</div>
              <div className="note">Output tax minus input tax</div>
            </div>
            <div className="figure"><div className="label">Stock value</div><div className="value">{inrWhole(data.stock_value)}</div><div className="note">At average purchase rate</div></div>
          </div>

          <div className="cols">
            <section className="panel">
              <header><h2>Sales and purchases, last 12 months</h2>
                <div className="legend"><span><i style={{ background: "var(--blue)" }} />Sales</span><span><i style={{ background: "var(--bar2)" }} />Purchases</span></div>
              </header>
              <div className="body"><MonthlyBars data={data.monthly} /></div>
            </section>

            <section className="panel">
              <header><h2>Needs attention</h2><Link href="/stock">All stock</Link></header>
              {data.low_stock.length === 0 ? (
                <div className="body muted">Every item is above its reorder level.</div>
              ) : (
                <div className="scroll">
                  <table className="ledger">
                    <tbody>
                      {data.low_stock.map((s) => (
                        <tr key={s.item_id}>
                          <td><b>{s.name}</b><div className="muted">{qty(s.on_hand)} {s.unit} left</div></td>
                          <td className="num"><StatusBadge status={s.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="panel">
            <header><h2>Latest bills</h2></header>
            <div className="scroll">
              <table className="ledger">
                <thead><tr><th>Bill</th><th>Date</th><th>Party</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {data.recent_bills.map((b) => (
                    <tr key={b.id} className="link">
                      <td><Link href={`/bills/${b.id}`}>{b.number}</Link> <span className={`badge ${b.bill_type}`}>{b.bill_type === "sale" ? "Sale" : "Purchase"}</span></td>
                      <td className="nowrap">{dateLabel(b.date)}</td>
                      <td>{b.party_name}</td>
                      <td className="num">{inr(b.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <details className="tools">
            <summary>Data tools</summary>
            <div className="actions">
              <button className="btn small danger" onClick={clear} disabled={busy}>Delete all data</button>
            </div>
          </details>
        </div>
      )}
    </>
  );
}
