"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { inr, qty } from "@/lib/format";
import { Empty, ErrorBox, Loading, PageHead, StatusBadge } from "@/components/ui";
import type { StockRow } from "@/lib/types";
import Link from "next/link";

function ReorderCell({ row, onSaved }: { row: StockRow; onSaved: () => void }) {
  const [val, setVal] = useState(String(row.reorder_level));
  const [err, setErr] = useState(false);
  const save = async () => {
    const n = Number(val);
    if (val.trim() === "" || !(n >= 0)) { setErr(true); return; }
    if (n === row.reorder_level) return;
    try { await api.patchItem(row.item_id, { reorder_level: n }); setErr(false); onSaved(); }
    catch (e) { setErr(true); if (e instanceof ApiError) window.alert(e.message); }
  };
  return (
    <input type="number" min="0" step="any" aria-label={`Reorder level for ${row.name}`} value={val}
      aria-invalid={err} onChange={(e) => setVal(e.target.value)} onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

export default function StockPage() {
  const { data, error, loading, slow, reload } = useLoad(() => api.stock(), []);
  const value = data?.reduce((s, r) => s + r.stock_value, 0) ?? 0;
  return (
    <>
      <PageHead title="Stock" sub="Bought minus sold, worked out from your bills. Set a reorder level to get a warning before you run out." />
      {loading && !data && <Loading slow={slow} />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <div className="panel">
          {data.length === 0 ? (
            <Empty title="No items yet" action={<Link className="btn primary" href="/purchases/new">Enter a purchase bill</Link>}>Items appear here the first time you use them on a bill.</Empty>
          ) : (
            <div className="scroll">
              <table className="ledger">
                <thead><tr><th>Item</th><th className="num">Bought</th><th className="num">Sold</th><th className="num">In stock</th><th className="num">Avg buy rate</th><th className="num">Last sale rate</th><th className="num">Value</th><th className="num">Reorder at</th><th>Status</th></tr></thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.item_id}>
                      <td><b>{r.name}</b>{r.hsn && <div className="muted">HSN {r.hsn}</div>}</td>
                      <td className="num">{qty(r.purchased_qty)}</td>
                      <td className="num">{qty(r.sold_qty)}</td>
                      <td className="num nowrap"><b>{qty(r.on_hand)}</b> {r.unit}</td>
                      <td className="num">{inr(r.avg_purchase_rate)}</td>
                      <td className="num">{inr(r.last_sale_rate)}</td>
                      <td className="num">{inr(r.stock_value)}</td>
                      <td className="num"><ReorderCell row={r} onSaved={reload} /></td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={6}>Total stock value</td><td className="num">{inr(value)}</td><td colSpan={2} /></tr></tfoot>
              </table>
            </div>
          )}
        </div>
      )}
      {data && data.length > 0 && (
        <p className="muted" style={{ marginTop: 14, maxWidth: "68ch" }}>
          Already had goods on the shelf before you started using this app? Enter them once as a purchase bill from a supplier called &quot;Opening stock&quot;, dated before your first sale.
        </p>
      )}
    </>
  );
}
