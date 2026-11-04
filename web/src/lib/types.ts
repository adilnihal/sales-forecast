export type BillType = "sale" | "purchase";

export interface Item {
  id: number;
  name: string;
  unit: string;
  hsn: string | null;
  gst_percent: number;
  reorder_level: number;
  last_sale_rate: number | null;
  last_purchase_rate: number | null;
}

export interface Party {
  id: number;
  name: string;
  kind: "customer" | "supplier";
  phone: string | null;
  gstin: string | null;
}

export interface BillSummary {
  id: number;
  bill_type: BillType;
  number: string;
  date: string;
  party_id: number;
  party_name: string;
  taxable: number;
  gst: number;
  total: number;
  line_count: number;
}

export interface BillLine {
  id: number;
  item_id: number;
  item_name: string;
  unit: string;
  qty: number;
  rate: number;
  gst_percent: number;
  taxable: number;
  gst: number;
  total: number;
}

export interface Bill extends BillSummary {
  notes: string | null;
  lines: BillLine[];
}

export type StockStatus = "ok" | "low" | "out" | "negative";

export interface StockRow {
  item_id: number;
  name: string;
  unit: string;
  hsn: string | null;
  gst_percent: number;
  reorder_level: number;
  purchased_qty: number;
  sold_qty: number;
  on_hand: number;
  avg_purchase_rate: number | null;
  last_sale_rate: number | null;
  stock_value: number;
  status: StockStatus;
}

export interface GstMonth {
  month: string;
  sales_taxable: number;
  output_tax: number;
  purchase_taxable: number;
  input_tax: number;
  net_payable: number;
}

export interface GstSummary {
  month: string | null;
  sales_taxable: number;
  output_tax: number;
  purchase_taxable: number;
  input_tax: number;
  net_payable: number;
  split: { cgst_output: number; sgst_output: number; cgst_input: number; sgst_input: number };
  by_rate: { gst_percent: number; sales_taxable: number; output_tax: number; purchase_taxable: number; input_tax: number }[];
  by_month: GstMonth[];
}

export interface Dashboard {
  month: string;
  sales_this_month: number;
  purchases_this_month: number;
  gst_net_this_month: number;
  stock_value: number;
  low_stock: StockRow[];
  bill_counts: { sale: number; purchase: number };
  monthly: { month: string; sales: number; purchases: number }[];
  recent_bills: BillSummary[];
}

export interface Forecast {
  item: string;
  item_id: number;
  unit: string;
  on_hand: number;
  months_of_history: number;
  history: { date: string; qty: number }[];
  forecast: { date: string; qty: number; lower: number; upper: number }[];
  backtest: { mape_model: number | null; mape_baseline: number | null; improvement_pct: number | null };
  reorder: { reorder_point: number; days_of_cover: number | null; needs_reorder: boolean; suggested_order_qty: number };
  explanation: string;
}

export interface NewBillLine {
  item_name: string;
  qty: number;
  rate: number;
  gst_percent: number;
}

export interface NewBill {
  bill_type: BillType;
  date: string;
  party_name: string;
  number: string;
  notes: string;
  lines: NewBillLine[];
}
