"""Billing API: items, parties, sales/purchase bills, stock, GST summary, dashboard, forecast."""
from __future__ import annotations

import datetime as dt
import os
from collections import defaultdict

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from .db import get_db
from .forecast import forecast_item, reorder_advice
from .llm import llm_explain
from .models import Bill, BillLine, Item, Party
from .schemas import (
    BillIn,
    BillOut,
    BillSummary,
    ItemIn,
    ItemOut,
    ItemPatch,
    LineOut,
    PartyIn,
    PartyOut,
)

router = APIRouter(prefix="/v1", tags=["billing"])


# ---------------------------------------------------------------- helpers
def r2(x: float) -> float:
    return round(float(x) + 0.0, 2)


def amounts(qty: float, rate: float, gst_percent: float) -> tuple[float, float, float]:
    """taxable value, GST amount, total for one bill line."""
    taxable = r2(qty * rate)
    gst = r2(taxable * gst_percent / 100)
    return taxable, gst, r2(taxable + gst)


def _month_key(d: dt.date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _check_month(month: str | None) -> str | None:
    if month is None or month == "":
        return None
    try:
        dt.datetime.strptime(month, "%Y-%m")
    except ValueError:
        raise HTTPException(status_code=400, detail="month must look like 2026-10")
    return month


def line_out(l: BillLine) -> LineOut:
    taxable, gst, total = amounts(l.qty, l.rate, l.gst_percent)
    return LineOut(
        id=l.id, item_id=l.item_id, item_name=l.item.name, unit=l.item.unit,
        qty=l.qty, rate=l.rate, gst_percent=l.gst_percent,
        taxable=taxable, gst=gst, total=total,
    )


def bill_summary(b: Bill) -> BillSummary:
    taxable = gst = 0.0
    for l in b.lines:
        t, g, _ = amounts(l.qty, l.rate, l.gst_percent)
        taxable += t
        gst += g
    return BillSummary(
        id=b.id, bill_type=b.bill_type, number=b.number, date=b.date,
        party_id=b.party_id, party_name=b.party.name,
        taxable=r2(taxable), gst=r2(gst), total=r2(taxable + gst), line_count=len(b.lines),
    )


def bill_out(b: Bill) -> BillOut:
    s = bill_summary(b)
    return BillOut(**s.model_dump(), notes=b.notes, lines=[line_out(l) for l in b.lines])


def _line_rows(db: Session):
    """(bill_type, date, gst_percent, qty, rate) for every bill line."""
    return db.execute(
        select(Bill.bill_type, Bill.date, BillLine.gst_percent, BillLine.qty, BillLine.rate)
        .join(BillLine, BillLine.bill_id == Bill.id)
    ).all()


def _last_rate(db: Session, item_id: int, bill_type: str) -> float | None:
    return db.execute(
        select(BillLine.rate)
        .join(Bill, Bill.id == BillLine.bill_id)
        .where(BillLine.item_id == item_id, Bill.bill_type == bill_type)
        .order_by(Bill.date.desc(), Bill.id.desc())
        .limit(1)
    ).scalar()


def item_out(db: Session, it: Item) -> ItemOut:
    return ItemOut(
        id=it.id, name=it.name, unit=it.unit, hsn=it.hsn,
        gst_percent=it.gst_percent, reorder_level=it.reorder_level,
        last_sale_rate=_last_rate(db, it.id, "sale"),
        last_purchase_rate=_last_rate(db, it.id, "purchase"),
    )


def _find_item(db: Session, name: str) -> Item | None:
    return db.execute(select(Item).where(func.lower(Item.name) == name.strip().lower())).scalar()


def _resolve_item(db: Session, item_id: int | None, name: str | None, gst_percent: float) -> Item:
    if item_id is not None:
        it = db.get(Item, item_id)
        if not it:
            raise HTTPException(status_code=404, detail=f"Item {item_id} not found")
        return it
    it = _find_item(db, name or "")
    if it:
        return it
    it = Item(name=(name or "").strip(), unit="kg", gst_percent=gst_percent)
    db.add(it)
    db.flush()
    return it


def _resolve_party(db: Session, party_id: int | None, name: str | None, kind: str) -> Party:
    if party_id is not None:
        p = db.get(Party, party_id)
        if not p:
            raise HTTPException(status_code=404, detail=f"Party {party_id} not found")
        return p
    clean = (name or "").strip() or "Walk-in customer"
    p = db.execute(
        select(Party).where(func.lower(Party.name) == clean.lower(), Party.kind == kind)
    ).scalar()
    if p:
        return p
    p = Party(name=clean, kind=kind)
    db.add(p)
    db.flush()
    return p


# ---------------------------------------------------------------- items
@router.get("/items", response_model=list[ItemOut])
def list_items(db: Session = Depends(get_db)):
    items = db.execute(select(Item).order_by(Item.name)).scalars().all()
    return [item_out(db, it) for it in items]


@router.post("/items", response_model=ItemOut, status_code=201)
def create_item(payload: ItemIn, db: Session = Depends(get_db)):
    if _find_item(db, payload.name):
        raise HTTPException(status_code=409, detail=f"Item '{payload.name}' already exists")
    it = Item(**payload.model_dump())
    db.add(it)
    db.commit()
    return item_out(db, it)


@router.patch("/items/{item_id}", response_model=ItemOut)
def update_item(item_id: int, payload: ItemPatch, db: Session = Depends(get_db)):
    it = db.get(Item, item_id)
    if not it:
        raise HTTPException(status_code=404, detail="Item not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is not None or k == "hsn":
            setattr(it, k, v)
    db.commit()
    return item_out(db, it)


# ---------------------------------------------------------------- parties
@router.get("/parties", response_model=list[PartyOut])
def list_parties(kind: str | None = None, db: Session = Depends(get_db)):
    q = select(Party).order_by(Party.name)
    if kind:
        q = q.where(Party.kind == kind)
    return db.execute(q).scalars().all()


@router.post("/parties", response_model=PartyOut, status_code=201)
def create_party(payload: PartyIn, db: Session = Depends(get_db)):
    exists = db.execute(
        select(Party).where(func.lower(Party.name) == payload.name.strip().lower(), Party.kind == payload.kind)
    ).scalar()
    if exists:
        raise HTTPException(status_code=409, detail=f"{payload.kind.title()} '{payload.name}' already exists")
    p = Party(**{**payload.model_dump(), "name": payload.name.strip()})
    db.add(p)
    db.commit()
    return p


# ---------------------------------------------------------------- bills
@router.get("/bills", response_model=list[BillSummary])
def list_bills(
    bill_type: str | None = Query(default=None, pattern="^(sale|purchase)$"),
    month: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    month = _check_month(month)
    q = select(Bill).options(selectinload(Bill.lines), selectinload(Bill.party))
    if bill_type:
        q = q.where(Bill.bill_type == bill_type)
    if month:
        y, m = map(int, month.split("-"))
        start = dt.date(y, m, 1)
        end = dt.date(y + (m == 12), 1 if m == 12 else m + 1, 1)
        q = q.where(Bill.date >= start, Bill.date < end)
    q = q.order_by(Bill.date.desc(), Bill.id.desc()).limit(limit).offset(offset)
    return [bill_summary(b) for b in db.execute(q).scalars().all()]


@router.post("/bills", response_model=BillOut, status_code=201)
def create_bill(payload: BillIn, db: Session = Depends(get_db)):
    kind = "customer" if payload.bill_type == "sale" else "supplier"
    party = _resolve_party(db, payload.party_id, payload.party_name, kind)
    bill = Bill(
        bill_type=payload.bill_type, date=payload.date, party=party,
        number=(payload.number or "").strip(), notes=payload.notes,
    )
    for l in payload.lines:
        item = _resolve_item(db, l.item_id, l.item_name, l.gst_percent)
        bill.lines.append(BillLine(item=item, qty=l.qty, rate=l.rate, gst_percent=l.gst_percent))
    db.add(bill)
    db.flush()
    if not bill.number:
        bill.number = f"{'S' if bill.bill_type == 'sale' else 'P'}-{bill.id:04d}"
    db.commit()
    return bill_out(bill)


@router.get("/bills/{bill_id}", response_model=BillOut)
def get_bill(bill_id: int, db: Session = Depends(get_db)):
    b = db.execute(
        select(Bill).options(selectinload(Bill.lines).selectinload(BillLine.item), selectinload(Bill.party))
        .where(Bill.id == bill_id)
    ).scalar()
    if not b:
        raise HTTPException(status_code=404, detail="Bill not found")
    return bill_out(b)


@router.delete("/bills/{bill_id}", status_code=204)
def delete_bill(bill_id: int, db: Session = Depends(get_db)):
    b = db.get(Bill, bill_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bill not found")
    db.delete(b)
    db.commit()


# ---------------------------------------------------------------- stock
def stock_map(db: Session) -> dict[int, dict]:
    q = (
        select(BillLine.item_id, Bill.bill_type, func.sum(BillLine.qty), func.sum(BillLine.qty * BillLine.rate))
        .join(Bill, Bill.id == BillLine.bill_id)
        .group_by(BillLine.item_id, Bill.bill_type)
    )
    out: dict[int, dict] = {}
    for item_id, kind, qty, amt in db.execute(q):
        a = out.setdefault(item_id, {"sale_qty": 0.0, "sale_amt": 0.0, "purchase_qty": 0.0, "purchase_amt": 0.0})
        a[f"{kind}_qty"] = float(qty or 0)
        a[f"{kind}_amt"] = float(amt or 0)
    return out


def _status(on_hand: float, reorder_level: float) -> str:
    if on_hand < 0:
        return "negative"
    if on_hand == 0:
        return "out"
    if reorder_level > 0 and on_hand <= reorder_level:
        return "low"
    return "ok"


@router.get("/stock")
def stock(db: Session = Depends(get_db)):
    agg = stock_map(db)
    rows = []
    for it in db.execute(select(Item).order_by(Item.name)).scalars().all():
        a = agg.get(it.id, {"sale_qty": 0.0, "sale_amt": 0.0, "purchase_qty": 0.0, "purchase_amt": 0.0})
        on_hand = a["purchase_qty"] - a["sale_qty"]
        avg_cost = a["purchase_amt"] / a["purchase_qty"] if a["purchase_qty"] else None
        rows.append({
            "item_id": it.id, "name": it.name, "unit": it.unit, "hsn": it.hsn,
            "gst_percent": it.gst_percent, "reorder_level": it.reorder_level,
            "purchased_qty": r2(a["purchase_qty"]), "sold_qty": r2(a["sale_qty"]),
            "on_hand": r2(on_hand),
            "avg_purchase_rate": r2(avg_cost) if avg_cost is not None else None,
            "last_sale_rate": _last_rate(db, it.id, "sale"),
            "stock_value": r2(on_hand * avg_cost) if avg_cost is not None and on_hand > 0 else 0.0,
            "status": _status(on_hand, it.reorder_level),
        })
    return rows


# ---------------------------------------------------------------- GST
@router.get("/gst/summary")
def gst_summary(month: str | None = None, db: Session = Depends(get_db)):
    """Output tax (sales) vs input tax (purchases). Split assumes intra-state (CGST + SGST)."""
    month = _check_month(month)
    by_rate: dict[float, dict] = defaultdict(
        lambda: {"sales_taxable": 0.0, "output_tax": 0.0, "purchase_taxable": 0.0, "input_tax": 0.0}
    )
    by_month: dict[str, dict] = defaultdict(
        lambda: {"sales_taxable": 0.0, "output_tax": 0.0, "purchase_taxable": 0.0, "input_tax": 0.0}
    )
    tot = {"sales_taxable": 0.0, "output_tax": 0.0, "purchase_taxable": 0.0, "input_tax": 0.0}
    for bill_type, d, pct, qty, rate in _line_rows(db):
        taxable, gst, _ = amounts(qty, rate, pct)
        tk, gk = ("sales_taxable", "output_tax") if bill_type == "sale" else ("purchase_taxable", "input_tax")
        mk = _month_key(d)
        by_month[mk][tk] += taxable
        by_month[mk][gk] += gst
        if month is None or mk == month:
            by_rate[pct][tk] += taxable
            by_rate[pct][gk] += gst
            tot[tk] += taxable
            tot[gk] += gst
    net = tot["output_tax"] - tot["input_tax"]
    return {
        "month": month,
        "sales_taxable": r2(tot["sales_taxable"]),
        "output_tax": r2(tot["output_tax"]),
        "purchase_taxable": r2(tot["purchase_taxable"]),
        "input_tax": r2(tot["input_tax"]),
        "net_payable": r2(net),  # negative means input credit carried forward
        "split": {
            "cgst_output": r2(tot["output_tax"] / 2), "sgst_output": r2(tot["output_tax"] / 2),
            "cgst_input": r2(tot["input_tax"] / 2), "sgst_input": r2(tot["input_tax"] / 2),
        },
        "by_rate": [
            {"gst_percent": k, **{kk: r2(vv) for kk, vv in v.items()}} for k, v in sorted(by_rate.items())
        ],
        "by_month": [
            {"month": k, **{kk: r2(vv) for kk, vv in v.items()}, "net_payable": r2(v["output_tax"] - v["input_tax"])}
            for k, v in sorted(by_month.items())
        ],
    }


# ---------------------------------------------------------------- dashboard
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    today = dt.date.today()
    this_month = _month_key(today)
    sales: dict[str, float] = defaultdict(float)
    purchases: dict[str, float] = defaultdict(float)
    out_tax = in_tax = 0.0
    for bill_type, d, pct, qty, rate in _line_rows(db):
        _, gst, total = amounts(qty, rate, pct)
        mk = _month_key(d)
        (sales if bill_type == "sale" else purchases)[mk] += total
        if mk == this_month:
            if bill_type == "sale":
                out_tax += gst
            else:
                in_tax += gst

    # last 12 months, oldest first
    months = []
    y, m = today.year, today.month
    for _ in range(12):
        months.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    months.reverse()

    stock_rows = stock(db)
    recent = db.execute(
        select(Bill).options(selectinload(Bill.lines), selectinload(Bill.party))
        .order_by(Bill.date.desc(), Bill.id.desc()).limit(6)
    ).scalars().all()
    counts = dict(db.execute(select(Bill.bill_type, func.count()).group_by(Bill.bill_type)).all())
    return {
        "month": this_month,
        "sales_this_month": r2(sales[this_month]),
        "purchases_this_month": r2(purchases[this_month]),
        "gst_net_this_month": r2(out_tax - in_tax),
        "stock_value": r2(sum(r["stock_value"] for r in stock_rows)),
        "low_stock": [r for r in stock_rows if r["status"] in ("low", "out", "negative")],
        "bill_counts": {"sale": counts.get("sale", 0), "purchase": counts.get("purchase", 0)},
        "monthly": [
            {"month": mk, "sales": r2(sales[mk]), "purchases": r2(purchases[mk])} for mk in months
        ],
        "recent_bills": [bill_summary(b) for b in recent],
    }


# ---------------------------------------------------------------- forecast
@router.get("/forecast/{item_id}")
def forecast(item_id: int, horizon: int = 3, lead_time_days: int = 7, db: Session = Depends(get_db)):
    if not 1 <= horizon <= 12:
        raise HTTPException(status_code=400, detail="horizon must be 1-12")
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    rows = db.execute(
        select(Bill.date, BillLine.qty)
        .join(BillLine, BillLine.bill_id == Bill.id)
        .where(BillLine.item_id == item_id, Bill.bill_type == "sale")
    ).all()
    if not rows:
        raise HTTPException(status_code=422, detail=f"No sales bills for '{item.name}' yet.")
    df = pd.DataFrame({"date": [pd.Timestamp(d) for d, _ in rows], "qty": [q for _, q in rows]})
    monthly = df.set_index("date")["qty"].resample("MS").sum()
    current = pd.Timestamp(dt.date.today()).replace(day=1)
    full = monthly[monthly.index < current]  # the running month is incomplete, so leave it out
    if len(full) < 6:
        raise HTTPException(
            status_code=422,
            detail=f"'{item.name}' needs at least 6 full months of sales bills (has {len(full)}).",
        )
    mdf = pd.DataFrame({"date": full.index, "item": item.name, "qty": full.values})
    res = forecast_item(mdf, item.name, horizon)
    nxt = res["forecast"][0]
    a = stock_map(db).get(item_id, {"sale_qty": 0.0, "purchase_qty": 0.0})
    on_hand = a["purchase_qty"] - a["sale_qty"]
    res["item_id"] = item.id
    res["unit"] = item.unit
    res["on_hand"] = r2(on_hand)
    res["reorder"] = reorder_advice(nxt["qty"], nxt["upper"], max(on_hand, 0.0), lead_time_days)
    res["explanation"] = llm_explain(item.name, res["history"], nxt, res["backtest"])
    res["months_of_history"] = int(len(full))
    return res


# ---------------------------------------------------------------- demo data
DEMO_ITEMS = [
    # name, unit, hsn, gst%, base kg/month, peak month, sale rate, purchase rate
    ("Pepper", "kg", "0904", 5.0, 1500, 12, 640.0, 585.0),
    ("Arecanut", "kg", "0802", 5.0, 2500, 10, 455.0, 420.0),
    ("Rubber Sheet", "kg", "4001", 12.0, 1400, 7, 192.0, 178.0),
    ("Coconut Oil", "L", "1513", 5.0, 900, 4, 265.0, 238.0),
]
DEMO_MONTHS = 36  # enough history to backtest the seasonal forecast (needs 2+ seasons of training)
DEMO_CUSTOMERS = ["Kannur Traders", "Malabar Stores", "Hari Agencies", "Sree Murugan Mills", "Walk-in customer"]
DEMO_SUPPLIERS = ["Wayanad Growers Co-op", "Iritty Farmers Society", "Thalassery Wholesale"]


def _allow_clear() -> bool:
    return os.getenv("ALLOW_CLEAR", "true").lower() in ("1", "true", "yes")


@router.post("/demo/seed", status_code=201)
def seed_demo(db: Session = Depends(get_db)):
    if db.execute(select(func.count()).select_from(Bill)).scalar():
        raise HTTPException(status_code=409, detail="Data already exists. Clear it first.")
    rng = np.random.default_rng(11)
    today = dt.date.today()
    cur = pd.Timestamp(today).replace(day=1)

    items = {}
    for name, unit, hsn, gst, base, peak, srate, prate in DEMO_ITEMS:
        it = _find_item(db, name) or Item(name=name, unit=unit, hsn=hsn, gst_percent=gst)
        it.reorder_level = float(round(base * (0.7 if name == 'Coconut Oil' else 0.35)))
        db.add(it)
        items[name] = it
    customers = {n: Party(name=n, kind="customer") for n in DEMO_CUSTOMERS}
    suppliers = {n: Party(name=n, kind="supplier") for n in DEMO_SUPPLIERS}
    db.add_all(list(customers.values()) + list(suppliers.values()))
    db.flush()

    n_bills = 0
    # Opening stock: the shop already had goods on the shelf when the first bill was entered.
    opening_day = (cur - pd.DateOffset(months=DEMO_MONTHS)).date()
    opening_sup = suppliers[DEMO_SUPPLIERS[0]]
    for name, unit, hsn, gst, base, peak, srate, prate in DEMO_ITEMS:
        ob = Bill(bill_type="purchase", date=opening_day, party=opening_sup, number="OPENING", notes="Opening stock")
        ob.lines.append(BillLine(item=items[name], qty=float(round(base * 1.2)), rate=float(prate), gst_percent=gst))
        db.add(ob)
        n_bills += 1
    for k in range(DEMO_MONTHS, -1, -1):  # DEMO_MONTHS full months + the running month
        start = (cur - pd.DateOffset(months=k)).date()
        last_day = (pd.Timestamp(start) + pd.offsets.MonthEnd(0)).day
        days_available = today.day if k == 0 else last_day
        frac = days_available / last_day
        n_dates = max(2, round(12 * frac))
        days = sorted(rng.choice(np.arange(1, days_available + 1), size=min(n_dates, days_available), replace=False))

        # sales: events (day, item, qty, rate) grouped into bills per day
        events: dict[int, list] = defaultdict(list)
        for name, unit, hsn, gst, base, peak, srate, prate in DEMO_ITEMS:
            season = 1 + 0.25 * np.cos(2 * np.pi * (start.month - peak) / 12)
            trend = 1 + 0.05 * (DEMO_MONTHS - k) / DEMO_MONTHS
            target = base * season * trend * rng.uniform(0.94, 1.06) * frac
            n_ev = 5 if k else 3
            parts = rng.dirichlet(np.ones(n_ev)) * target
            for q in parts:
                d = int(rng.choice(days))
                rate = float(round(srate * (1 + 0.06 * np.sin(k / 3)) * rng.uniform(0.97, 1.03), 1))
                events[d].append((name, max(1, int(round(float(q)))), rate, gst))
        for d, evs in sorted(events.items()):
            cust = customers[DEMO_CUSTOMERS[int(rng.integers(len(DEMO_CUSTOMERS)))]]
            bill = Bill(bill_type="sale", date=dt.date(start.year, start.month, d), party=cust)
            for name, q, rate, gst in evs:
                bill.lines.append(BillLine(item=items[name], qty=float(q), rate=rate, gst_percent=gst))
            db.add(bill)
            n_bills += 1

        # purchases: two per month per item, close to what is sold
        for name, unit, hsn, gst, base, peak, srate, prate in DEMO_ITEMS:
            season = 1 + 0.25 * np.cos(2 * np.pi * (start.month - peak) / 12)
            target = base * season * rng.uniform(0.95, 1.05) * frac
            for part in range(2):
                d = min(days_available, 3 + 14 * part)
                sup = suppliers[DEMO_SUPPLIERS[int(rng.integers(len(DEMO_SUPPLIERS)))]]
                rate = float(round(prate * (1 + 0.06 * np.sin(k / 3)) * rng.uniform(0.97, 1.03), 1))
                bill = Bill(
                    bill_type="purchase", date=dt.date(start.year, start.month, d), party=sup,
                    number=f"INV-{int(rng.integers(1000, 9999))}",
                )
                bill.lines.append(BillLine(item=items[name], qty=float(round(target / 2)), rate=rate, gst_percent=gst))
                db.add(bill)
                n_bills += 1
    db.flush()
    for b in db.execute(select(Bill).where(Bill.number == "")).scalars():
        b.number = f"{'S' if b.bill_type == 'sale' else 'P'}-{b.id:04d}"
    db.commit()
    return {"status": "seeded", "bills": n_bills}


@router.post("/demo/clear")
def clear_all(confirm: str = "", db: Session = Depends(get_db)):
    if not _allow_clear():
        raise HTTPException(status_code=403, detail="Clearing data is disabled on this server.")
    if confirm != "yes":
        raise HTTPException(status_code=400, detail="Pass confirm=yes to delete ALL bills, items and parties.")
    for model in (BillLine, Bill, Party, Item):
        db.execute(delete(model))
    db.commit()
    return {"status": "cleared"}
