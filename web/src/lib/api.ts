import type {
  Bill, BillSummary, BillType, Dashboard, Forecast, GstSummary, Item, NewBill, Party, StockRow,
} from "./types";

const BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** FastAPI sends either {detail: "text"} or {detail: [{loc, msg}, ...]} for validation errors. */
function explain(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const where = Array.isArray(d.loc) ? d.loc.filter((p: unknown) => p !== "body").join(" › ") : "";
        const msg = String(d.msg ?? "invalid").replace(/^Value error, /, "");
        return where ? `${where}: ${msg}` : msg;
      })
      .join("; ");
  }
  return "Something went wrong.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError: ApiError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
        cache: "no-store",
      });
    } catch {
      lastError = new ApiError("Can't reach the server. Check your internet connection.", 0);
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    // 502/503/504 = the free-tier API is still waking up: retry quietly.
    if ([502, 503, 504].includes(res.status) && (init?.method ?? "GET") === "GET") {
      lastError = new ApiError("The server is waking up. Try again in a minute.", res.status);
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    if (!res.ok) {
      let detail: unknown = null;
      try {
        detail = (await res.json()).detail;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(explain(detail), res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  throw lastError ?? new ApiError("Request failed.", 0);
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  return p.length ? "?" + p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&") : "";
};

export const api = {
  dashboard: () => request<Dashboard>("/dashboard"),
  items: () => request<Item[]>("/items"),
  createItem: (b: { name: string; unit: string; hsn: string | null; gst_percent: number; reorder_level: number }) =>
    request<Item>("/items", { method: "POST", body: JSON.stringify(b) }),
  patchItem: (id: number, b: Partial<Pick<Item, "unit" | "hsn" | "gst_percent" | "reorder_level">>) =>
    request<Item>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  parties: (kind?: "customer" | "supplier") => request<Party[]>(`/parties${qs({ kind })}`),
  bills: (type: BillType, month?: string) =>
    request<BillSummary[]>(`/bills${qs({ bill_type: type, month, limit: 500 })}`),
  bill: (id: number) => request<Bill>(`/bills/${id}`),
  createBill: (b: NewBill) =>
    request<Bill>("/bills", {
      method: "POST",
      body: JSON.stringify({
        bill_type: b.bill_type,
        date: b.date,
        party_name: b.party_name.trim() || undefined,
        number: b.number.trim() || undefined,
        notes: b.notes.trim() || undefined,
        lines: b.lines,
      }),
    }),
  deleteBill: (id: number) => request<void>(`/bills/${id}`, { method: "DELETE" }),
  stock: () => request<StockRow[]>("/stock"),
  gst: (month?: string) => request<GstSummary>(`/gst/summary${qs({ month })}`),
  forecast: (itemId: number, horizon: number, leadTimeDays: number) =>
    request<Forecast>(`/forecast/${itemId}${qs({ horizon, lead_time_days: leadTimeDays })}`),
  seedDemo: () => request<{ bills: number }>("/demo/seed", { method: "POST" }),
  clearAll: () => request<{ status: string }>("/demo/clear?confirm=yes", { method: "POST" }),
};
