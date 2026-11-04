"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { inr, lineAmounts, qty as fmtQty, round2, todayISO } from "@/lib/format";
import type { BillType, Item } from "@/lib/types";

interface Line {
  key: number;
  item: string;
  qty: string;
  rate: string;
  gst: string;
  rateAuto: boolean; // rate was filled from the last bill, so it may be replaced when the item changes
  gstAuto: boolean;
  focus?: boolean;
}

let nextKey = 1;
const blankLine = (focus = false): Line => ({ key: nextKey++, item: "", qty: "", rate: "", gst: "5", rateAuto: true, gstAuto: true, focus });

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function BillForm({ type }: { type: BillType }) {
  const router = useRouter();
  const isSale = type === "sale";
  const formRef = useRef<HTMLFormElement>(null);
  const [date, setDate] = useState("");
  const [party, setParty] = useState("");
  const [number, setNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDate(todayISO()), []);

  const items = useLoad(() => api.items(), []);
  const parties = useLoad(() => api.parties(isSale ? "customer" : "supplier"), [type]);
  const stock = useLoad(() => (isSale ? api.stock() : Promise.resolve([])), [type]);

  const findItem = (name: string): Item | undefined =>
    items.data?.find((i) => i.name.toLowerCase() === name.trim().toLowerCase());

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch, focus: false } : l)));

  const onItem = (key: number, value: string) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next: Line = { ...l, item: value, focus: false };
        const known = findItem(value);
        if (known) {
          const last = isSale ? known.last_sale_rate : known.last_purchase_rate;
          if ((l.rateAuto || l.rate === "") && last !== null) {
            next.rate = String(last);
            next.rateAuto = true;
          }
          if (l.gstAuto) next.gst = String(known.gst_percent);
        }
        return next;
      }),
    );

  const addLine = () => setLines((ls) => [...ls.map((l) => ({ ...l, focus: false })), blankLine(true)]);
  const removeLine = (key: number) => setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((l) => l.key !== key)));

  // Enter moves to the next box instead of saving the bill by accident.
  const onKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const t = e.target as HTMLElement;
    if (e.key !== "Enter" || t.tagName !== "INPUT") return;
    e.preventDefault();
    const fields = Array.from(formRef.current!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"));
    const i = fields.indexOf(t as HTMLInputElement);
    if (t.dataset.lastGst === "1") return addLine();
    fields[i + 1]?.focus();
  };

  const calc = useMemo(() => {
    let taxable = 0, gst = 0;
    const per = lines.map((l) => {
      const q = num(l.qty), r = num(l.rate), g = num(l.gst);
      if (!(q > 0) || !(r >= 0) || !(g >= 0)) return null;
      const a = lineAmounts(q, r, g);
      taxable += a.taxable;
      gst += a.gst;
      return a;
    });
    taxable = round2(taxable);
    gst = round2(gst);
    const cgst = round2(gst / 2);
    return { per, taxable, gst, cgst, sgst: round2(gst - cgst), total: round2(taxable + gst) };
  }, [lines]);

  const stockFor = (name: string) => {
    const it = findItem(name);
    return it ? stock.data?.find((s) => s.item_id === it.id) : undefined;
  };
  const plannedQty = (name: string) =>
    lines.filter((l) => l.item.trim().toLowerCase() === name.trim().toLowerCase()).reduce((s, l) => s + (num(l.qty) || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const filled = lines.filter((l) => l.item.trim() || l.qty || l.rate);
    if (filled.length === 0) return setError("Add at least one item.");
    for (const [i, l] of filled.entries()) {
      const n = i + 1;
      if (!l.item.trim()) return setError(`Line ${n}: enter the item name.`);
      if (!(num(l.qty) > 0)) return setError(`Line ${n}: quantity must be more than 0.`);
      if (!(num(l.rate) >= 0)) return setError(`Line ${n}: enter the rate.`);
      if (!(num(l.gst) >= 0 && num(l.gst) <= 28)) return setError(`Line ${n}: GST % must be between 0 and 28.`);
    }
    if (!isSale && !party.trim()) return setError("Enter the supplier's name.");
    if (!date) return setError("Pick the bill date.");
    setSaving(true);
    try {
      const bill = await api.createBill({
        bill_type: type,
        date,
        party_name: party,
        number,
        notes,
        lines: filled.map((l) => ({ item_name: l.item.trim(), qty: num(l.qty), rate: num(l.rate), gst_percent: num(l.gst) })),
      });
      router.push(`/bills/${bill.id}?saved=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the bill.");
      setSaving(false);
    }
  };

  return (
    <form ref={formRef} className="bill-sheet" onSubmit={submit} onKeyDown={onKeyDown} noValidate>
      <div className="bill-inner">
        <div className="bill-head">
          <h2>{isSale ? "Sales bill" : "Purchase bill"}</h2>
          <div className="no">
            Bill no.
            <b>Assigned when saved</b>
          </div>
        </div>

        <div className="bill-meta">
          <div>
            <label className="f" htmlFor="party">{isSale ? "Customer" : "Supplier"}</label>
            <input id="party" className="pen" list="parties-list" autoComplete="off" value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder={isSale ? "Leave empty for a walk-in customer" : "Supplier name"} />
            <datalist id="parties-list">{parties.data?.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </div>
          <div>
            <label className="f" htmlFor="date">Date</label>
            <input id="date" className="pen" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="f" htmlFor="number">{isSale ? "Bill no. (optional)" : "Supplier invoice no."}</label>
            <input id="number" className="pen" value={number} onChange={(e) => setNumber(e.target.value)}
              placeholder={isSale ? "Auto" : "Optional"} maxLength={40} />
          </div>
        </div>

        <datalist id="items-list">{items.data?.map((i) => <option key={i.id} value={i.name} />)}</datalist>
        <div className="lines-head" aria-hidden="true">
          <span>Item</span><span className="num">Qty</span><span className="num">Rate (₹)</span><span className="num">GST %</span><span className="num">Amount</span><span />
        </div>

        {lines.map((l, idx) => {
          const known = findItem(l.item);
          const st = isSale && known ? stockFor(l.item) : undefined;
          const planned = plannedQty(l.item);
          const over = st && planned > st.on_hand;
          const lastRate = known ? (isSale ? known.last_sale_rate : known.last_purchase_rate) : null;
          return (
            <div className="line" key={l.key}>
              <div className="item">
                <span className="cell-label">Item</span>
                <input className="pen" list="items-list" autoComplete="off" aria-label={`Item, line ${idx + 1}`}
                  autoFocus={l.focus} value={l.item} onChange={(e) => onItem(l.key, e.target.value)} placeholder="e.g. Pepper" />
              </div>
              <div>
                <span className="cell-label">Qty{known ? ` (${known.unit})` : ""}</span>
                <input className="pen r" type="number" inputMode="decimal" min="0" step="any" aria-label={`Quantity, line ${idx + 1}`}
                  value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} placeholder="0" />
              </div>
              <div>
                <span className="cell-label">Rate (₹)</span>
                <input className="pen r" type="number" inputMode="decimal" min="0" step="0.01" aria-label={`Rate, line ${idx + 1}`}
                  value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value, rateAuto: false })} placeholder="0.00" />
              </div>
              <div>
                <span className="cell-label">GST %</span>
                <input className="pen r" type="number" inputMode="decimal" min="0" max="28" step="0.5" aria-label={`GST percent, line ${idx + 1}`}
                  data-last-gst={idx === lines.length - 1 ? "1" : "0"}
                  value={l.gst} onChange={(e) => update(l.key, { gst: e.target.value, gstAuto: false })} />
              </div>
              <div className="amount">
                <span className="cell-label">Amount</span>
                {calc.per[idx] ? inr(calc.per[idx]!.taxable) : "–"}
              </div>
              <button type="button" className="rm" onClick={() => removeLine(l.key)} aria-label={`Remove line ${idx + 1}`}>×</button>
              {known && (
                <p className={`hint stockhint ${over ? "bad" : ""}`}>
                  {isSale && st && (over
                    ? `Only ${fmtQty(st.on_hand)} ${known.unit} in stock. This bill will take stock below zero. `
                    : `In stock: ${fmtQty(st.on_hand)} ${known.unit}. `)}
                  {lastRate !== null && `Last ${isSale ? "sold" : "bought"} at ${inr(lastRate)}.`}
                </p>
              )}
            </div>
          );
        })}

        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn small" onClick={addLine}>+ Add item</button>
        </div>

        <div className="sheet-foot">
          <div style={{ flex: "1 1 240px", maxWidth: 380 }}>
            <label className="f" htmlFor="notes">Note (optional)</label>
            <input id="notes" className="pen" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300}
              placeholder="Vehicle number, payment mode, etc." />
          </div>
          <div className="totals" aria-live="polite">
            <div><span>Taxable value</span><b>{inr(calc.taxable)}</b></div>
            <div><span>CGST</span><b>{inr(calc.cgst)}</b></div>
            <div><span>SGST</span><b>{inr(calc.sgst)}</b></div>
            <div className="grand"><span>Total</span><b>{inr(calc.total)}</b></div>
          </div>
        </div>

        {error && <div className="alert error" role="alert" style={{ marginTop: 18 }}>{error}</div>}
        <div className="sheet-actions">
          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save bill"}</button>
          <button className="btn" type="button" onClick={() => router.push(isSale ? "/sales" : "/purchases")} disabled={saving}>Cancel</button>
          <span className="hint">Enter moves to the next box. New items are added to your stock list automatically.</span>
        </div>
      </div>
    </form>
  );
}
