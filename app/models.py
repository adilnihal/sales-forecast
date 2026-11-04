"""Database tables: items, parties, bills and bill lines."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Date, DateTime, Float, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    unit: Mapped[str] = mapped_column(String(16), default="kg")
    hsn: Mapped[str | None] = mapped_column(String(16), nullable=True)
    gst_percent: Mapped[float] = mapped_column(Float, default=5.0)
    reorder_level: Mapped[float] = mapped_column(Float, default=0.0)


class Party(Base):
    __tablename__ = "parties"
    __table_args__ = (UniqueConstraint("name", "kind", name="uq_party_name_kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(10))  # customer | supplier
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_type: Mapped[str] = mapped_column(String(10), index=True)  # sale | purchase
    number: Mapped[str] = mapped_column(String(40), default="")
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    party_id: Mapped[int] = mapped_column(ForeignKey("parties.id"))
    notes: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, server_default=func.now())

    party: Mapped[Party] = relationship()
    lines: Mapped[list["BillLine"]] = relationship(
        back_populates="bill", cascade="all, delete-orphan", order_by="BillLine.id"
    )


class BillLine(Base):
    __tablename__ = "bill_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    qty: Mapped[float] = mapped_column(Float)
    rate: Mapped[float] = mapped_column(Float)
    gst_percent: Mapped[float] = mapped_column(Float, default=0.0)

    bill: Mapped[Bill] = relationship(back_populates="lines")
    item: Mapped[Item] = relationship()
