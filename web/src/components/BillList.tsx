"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { dateLabel, inr } from "@/lib/format";
import type { BillType } from "@/lib/types";
import { Empty, ErrorBox, Loading, PageHead } from "./ui";

function monthOptions() {
  const out: { value: string; label: string }[] = [{ value: "", label: "All months" }];
  const d = new Date();
  for (let i = 0; i < 18; i++) {
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value: v, label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export function BillList({ type }: { type: BillType }) {
  const isSale = type === "sale";
  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");
  const { data, error, loading, slow, reload } = useLoad(() => api.bills(type, month || undefined), [type, month]);

  const rows = (data ?? []).filter((b) => {
    const q = search.trim().toLowerCase();
    return !q || b.party_name.toLowerCase().includes(q) || b.number.toLowerCase().includes(q);
  });
  const sum = rows.reduce((s, b) => ({ taxable: s.taxable + b.taxable, gst: s.gst + b.gst, total: s.total + b.total }), { taxable: 0, gst: 0, total: 0 });
  const newHref = isSale ? "/sales/new" : "/purchases/new";

  return (
    <>
      <PageHead title={isSale ? "Sales bills" : "Purchase bills"} sub={isSale ? "Bills you gave to customers." : "Bills from your suppliers."}>
        <Link className="btn primary" href={newHref}>{isSale ? "New sales bill" : "New purchase bill"}</Link>
      </PageHead>

      <div className="filters" style={{ marginBottom: 16 }}>
        <div>
          <label className="f" htmlFor="m">Month</label>
          <select id="m" value={month} onChange={(e) => setMonth(e.target.value)}>
            {monthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 220px", maxWidth: 340 }}>
          <label className="f" htmlFor="s">Search</label>
          <input id="s" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isSale ? "Customer or bill no." : "Supplier or invoice no."} />
        </div>
      </div>

      {loading && !data && <Loading slow={slow} />}
      {error && <ErrorBox error={error} onRetry={reload} />}

      {data && (
        <div className="panel">
          {rows.length === 0 ? (
            <Empty title={data.length === 0 ? (isSale ? "No sales bills yet" : "No purchase bills yet") : "No bills match"}
              action={data.length === 0 ? <Link className="btn primary" href={newHref}>{isSale ? "Enter a sales bill" : "Enter a purchase bill"}</Link> : undefined}>
              {data.length === 0 ? "Bills you save will be listed here." : "Try another month or a different search."}
            </Empty>
          ) : (
            <div className="scroll">
              <table className="ledger">
                <thead>
                  <tr><th>Bill no.</th><th>Date</th><th>{isSale ? "Customer" : "Supplier"}</th><th className="num">Items</th><th className="num">Taxable</th><th className="num">GST</th><th className="num">Total</th></tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id} className="link">
                      <td><Link href={`/bills/${b.id}`}>{b.number}</Link></td>
                      <td className="nowrap">{dateLabel(b.date)}</td>
                      <td>{b.party_name}</td>
                      <td className="num">{b.line_count}</td>
                      <td className="num">{inr(b.taxable)}</td>
                      <td className="num">{inr(b.gst)}</td>
                      <td className="num"><b>{inr(b.total)}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={4}>{rows.length} bills</td><td className="num">{inr(sum.taxable)}</td><td className="num">{inr(sum.gst)}</td><td className="num">{inr(sum.total)}</td></tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
