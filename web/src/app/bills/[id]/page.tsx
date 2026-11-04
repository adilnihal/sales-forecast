"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { dateLabel, inr, qty, round2 } from "@/lib/format";
import { ErrorBox, Loading, PageHead } from "@/components/ui";

function Detail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const saved = useSearchParams().get("saved") === "1";
  const { data: b, error, loading, slow, reload } = useLoad(() => api.bill(Number(id)), [id]);
  const [err, setErr] = useState<string | null>(null);

  const remove = async () => {
    if (!b || !window.confirm(`Delete bill ${b.number}? Stock and GST will change.`)) return;
    try {
      await api.deleteBill(b.id);
      router.push(b.bill_type === "sale" ? "/sales" : "/purchases");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not delete the bill.");
    }
  };

  if (loading && !b) return <Loading slow={slow} />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!b) return null;
  const isSale = b.bill_type === "sale";
  const cgst = round2(b.gst / 2);

  return (
    <>
      <PageHead title={`${isSale ? "Sales" : "Purchase"} bill ${b.number}`}>
        <button className="btn noprint" onClick={() => window.print()}>Print</button>
        <Link className="btn noprint" href={isSale ? "/sales/new" : "/purchases/new"}>New bill</Link>
        <button className="btn danger noprint" onClick={remove}>Delete</button>
      </PageHead>
      {saved && <div className="alert success noprint" role="status" style={{ marginBottom: 16 }}>Bill saved. Stock and GST are updated.</div>}
      {err && <div className="alert error" role="alert" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="bill-sheet">
        <div className="bill-inner">
          <div className="bill-head">
            <h2>{isSale ? "Sales bill" : "Purchase bill"}</h2>
            <div className="no">Bill no.<b>{b.number}</b></div>
          </div>
          <div className="bill-meta">
            <div><div className="muted">{isSale ? "Customer" : "Supplier"}</div><b>{b.party_name}</b></div>
            <div><div className="muted">Date</div><b>{dateLabel(b.date)}</b></div>
            <div><div className="muted">Items</div><b>{b.line_count}</b></div>
          </div>
          <div className="scroll">
            <table className="ledger">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Taxable</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {b.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.item_name}</td>
                    <td className="num nowrap">{qty(l.qty)} {l.unit}</td>
                    <td className="num">{inr(l.rate)}</td>
                    <td className="num">{inr(l.taxable)}</td>
                    <td className="num nowrap">{inr(l.gst)} <span className="muted">({l.gst_percent}%)</span></td>
                    <td className="num"><b>{inr(l.total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sheet-foot">
            <div>{b.notes && (<><div className="muted">Note</div><p>{b.notes}</p></>)}</div>
            <div className="totals">
              <div><span>Taxable value</span><b>{inr(b.taxable)}</b></div>
              <div><span>CGST</span><b>{inr(cgst)}</b></div>
              <div><span>SGST</span><b>{inr(round2(b.gst - cgst))}</b></div>
              <div className="grand"><span>Total</span><b>{inr(b.total)}</b></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Detail /></Suspense>;
}
