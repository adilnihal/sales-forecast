"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { inr, monthLabel } from "@/lib/format";
import { Empty, ErrorBox, Loading, PageHead } from "@/components/ui";

export default function GstPage() {
  const [month, setMonth] = useState("");
  const { data, error, loading, slow, reload } = useLoad(() => api.gst(month || undefined), [month]);
  const months = data?.by_month.map((m) => m.month).slice().reverse() ?? [];
  const none = data && data.by_month.length === 0;
  const pay = data ? data.net_payable > 0 : false;

  return (
    <>
      <PageHead title="GST" sub="Tax you collected on sales minus tax you paid on purchases. Share this with your accountant when you file.">
        <div className="noprint" style={{ minWidth: 180 }}>
          <label className="f" htmlFor="gm">Month</label>
          <select id="gm" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">All months</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      </PageHead>
      {loading && !data && <Loading slow={slow} />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {none && <div className="panel"><Empty title="No GST to show yet">Save a sales or purchase bill with a GST % and it will be counted here.</Empty></div>}

      {data && !none && (
        <div className="stack">
          <div className="panel figures">
            <div className="figure"><div className="label">Tax collected on sales</div><div className="value">{inr(data.output_tax)}</div><div className="note">On {inr(data.sales_taxable)} of sales</div></div>
            <div className="figure"><div className="label">Tax paid on purchases</div><div className="value">{inr(data.input_tax)}</div><div className="note">On {inr(data.purchase_taxable)} of purchases</div></div>
            <div className={`figure ${pay ? "warn" : "good"}`}><div className="label">{pay ? "GST to pay" : "Input credit"}</div><div className="value">{inr(Math.abs(data.net_payable))}</div><div className="note">{pay ? "Collected minus paid" : "Paid more than collected"}</div></div>
            <div className="figure"><div className="label">CGST + SGST on sales</div><div className="value">{inr(data.split.cgst_output)}</div><div className="note">Each, assuming sales within Kerala</div></div>
          </div>

          <section className="panel">
            <header><h2>By GST rate</h2></header>
            <div className="scroll"><table className="ledger">
              <thead><tr><th>Rate</th><th className="num">Sales (taxable)</th><th className="num">Tax collected</th><th className="num">Purchases (taxable)</th><th className="num">Tax paid</th></tr></thead>
              <tbody>{data.by_rate.map((r) => (
                <tr key={r.gst_percent}><td><b>{r.gst_percent}%</b></td><td className="num">{inr(r.sales_taxable)}</td><td className="num">{inr(r.output_tax)}</td><td className="num">{inr(r.purchase_taxable)}</td><td className="num">{inr(r.input_tax)}</td></tr>
              ))}</tbody>
            </table></div>
          </section>

          <section className="panel">
            <header><h2>Month by month</h2></header>
            <div className="scroll"><table className="ledger">
              <thead><tr><th>Month</th><th className="num">Tax collected</th><th className="num">Tax paid</th><th className="num">To pay / (credit)</th></tr></thead>
              <tbody>{data.by_month.slice().reverse().map((m) => (
                <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="num">{inr(m.output_tax)}</td><td className="num">{inr(m.input_tax)}</td><td className="num"><b>{inr(m.net_payable)}</b></td></tr>
              ))}</tbody>
            </table></div>
          </section>
          <p className="muted">Figures are worked out from the bills you entered. They do not replace a GST return filed by your accountant.</p>
        </div>
      )}
    </>
  );
}
