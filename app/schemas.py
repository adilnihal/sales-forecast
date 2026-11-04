"""Request/response shapes for the billing API."""
from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    unit: str = Field(default="kg", max_length=16)
    hsn: str | None = Field(default=None, max_length=16)
    gst_percent: float = Field(default=5.0, ge=0, le=28)
    reorder_level: float = Field(default=0.0, ge=0)

    @field_validator("name", "unit")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be empty")
        return v


class ItemPatch(BaseModel):
    unit: str | None = Field(default=None, max_length=16)
    hsn: str | None = Field(default=None, max_length=16)
    gst_percent: float | None = Field(default=None, ge=0, le=28)
    reorder_level: float | None = Field(default=None, ge=0)


class ItemOut(BaseModel):
    id: int
    name: str
    unit: str
    hsn: str | None
    gst_percent: float
    reorder_level: float
    last_sale_rate: float | None = None
    last_purchase_rate: float | None = None


class PartyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["customer", "supplier"]
    phone: str | None = Field(default=None, max_length=20)
    gstin: str | None = Field(default=None, max_length=20)


class PartyOut(BaseModel):
    id: int
    name: str
    kind: str
    phone: str | None
    gstin: str | None


class LineIn(BaseModel):
    item_id: int | None = None
    item_name: str | None = Field(default=None, max_length=120)
    qty: float = Field(gt=0)
    rate: float = Field(ge=0)
    gst_percent: float = Field(default=0.0, ge=0, le=28)

    @model_validator(mode="after")
    def _need_item(self):
        if self.item_id is None and not (self.item_name and self.item_name.strip()):
            raise ValueError("each line needs item_id or item_name")
        return self


class BillIn(BaseModel):
    bill_type: Literal["sale", "purchase"]
    date: dt.date
    party_id: int | None = None
    party_name: str | None = Field(default=None, max_length=120)
    number: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=300)
    lines: list[LineIn] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def _need_party(self):
        has_party = self.party_id is not None or bool(self.party_name and self.party_name.strip())
        if self.bill_type == "purchase" and not has_party:
            raise ValueError("a purchase bill needs a supplier (party_id or party_name)")
        return self


class LineOut(BaseModel):
    id: int
    item_id: int
    item_name: str
    unit: str
    qty: float
    rate: float
    gst_percent: float
    taxable: float
    gst: float
    total: float


class BillSummary(BaseModel):
    id: int
    bill_type: str
    number: str
    date: dt.date
    party_id: int
    party_name: str
    taxable: float
    gst: float
    total: float
    line_count: int


class BillOut(BillSummary):
    notes: str | None
    lines: list[LineOut]
