"use client";

import type { ReactNode } from "react";
import type { ApiError } from "@/lib/api";
import type { StockStatus } from "@/lib/types";

export function Loading({ slow }: { slow?: boolean }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <i /><i /><i />
      {slow && <p className="muted">Waking up the server. The first load can take up to a minute.</p>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="alert error" role="alert" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 200 }}>{error.message}</span>
      {onRetry && <button className="btn small" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="actions" style={{ justifyContent: "center" }}>{action}</div>}
    </div>
  );
}

const STATUS_TEXT: Record<StockStatus, string> = { ok: "In stock", low: "Reorder soon", out: "Out of stock", negative: "Sold more than bought" };
export function StatusBadge({ status }: { status: StockStatus }) {
  return <span className={`badge ${status}`}>{STATUS_TEXT[status]}</span>;
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
