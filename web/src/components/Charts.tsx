import { monthShort } from "@/lib/format";

const nice = (max: number) => {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
};

const compact = (n: number) =>
  n >= 1e7 ? `${+(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(Math.round(n));

/** Grouped bars: sales vs purchases per month. */
export function MonthlyBars({ data }: { data: { month: string; sales: number; purchases: number }[] }) {
  const W = 640, H = 250, L = 46, R = 8, T = 10, B = 28;
  const max = nice(Math.max(...data.flatMap((d) => [d.sales, d.purchases]), 1));
  const iw = W - L - R, ih = H - T - B;
  const step = iw / data.length;
  const bw = Math.min(16, step * 0.34);
  const y = (v: number) => T + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly sales and purchases for the last 12 months">
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end">{compact(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = L + step * i + step / 2;
        return (
          <g key={d.month}>
            <rect x={cx - bw - 1} y={y(d.sales)} width={bw} height={T + ih - y(d.sales)} fill="var(--blue)" rx="1.5">
              <title>{`${d.month} sales: ${Math.round(d.sales).toLocaleString("en-IN")}`}</title>
            </rect>
            <rect x={cx + 1} y={y(d.purchases)} width={bw} height={T + ih - y(d.purchases)} fill="var(--bar2)" rx="1.5">
              <title>{`${d.month} purchases: ${Math.round(d.purchases).toLocaleString("en-IN")}`}</title>
            </rect>
            <text x={cx} y={H - 9} textAnchor="middle">{monthShort(d.month)}</text>
          </g>
        );
      })}
      <line className="axis" x1={L} x2={W - R} y1={T + ih} y2={T + ih} />
    </svg>
  );
}

/** History line + dashed forecast with an uncertainty band. */
export function ForecastChart({
  history, forecast, unit,
}: {
  history: { date: string; qty: number }[];
  forecast: { date: string; qty: number; lower: number; upper: number }[];
  unit: string;
}) {
  const W = 680, H = 280, L = 50, R = 14, T = 12, B = 30;
  const all = [...history.map((h) => h.date), ...forecast.map((f) => f.date)];
  const max = nice(Math.max(...history.map((h) => h.qty), ...forecast.map((f) => f.upper), 1));
  const iw = W - L - R, ih = H - T - B;
  const x = (i: number) => L + (all.length === 1 ? iw / 2 : (iw * i) / (all.length - 1));
  const y = (v: number) => T + ih - (v / max) * ih;
  const hPts = history.map((h, i) => `${x(i)},${y(h.qty)}`).join(" ");
  const off = history.length;
  const last = history[history.length - 1];
  const fPts = [`${x(off - 1)},${y(last.qty)}`, ...forecast.map((f, i) => `${x(off + i)},${y(f.qty)}`)].join(" ");
  const band = [
    `${x(off - 1)},${y(last.qty)}`,
    ...forecast.map((f, i) => `${x(off + i)},${y(f.upper)}`),
    ...[...forecast].reverse().map((f, i) => `${x(off + forecast.length - 1 - i)},${y(f.lower)}`),
  ].join(" ");
  const every = Math.ceil(all.length / 9);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Past sales and forecast in ${unit} per month`}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end">{compact(t)}</text>
        </g>
      ))}
      <polygon points={band} fill="var(--blue)" opacity="0.16" />
      <polyline points={hPts} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      <polyline points={fPts} fill="none" stroke="var(--blue)" strokeWidth="2.4" strokeDasharray="6 4" strokeLinejoin="round" />
      {forecast.map((f, i) => (
        <circle key={f.date} cx={x(off + i)} cy={y(f.qty)} r="4" fill="var(--blue)">
          <title>{`${f.date.slice(0, 7)}: ${Math.round(f.qty).toLocaleString("en-IN")} ${unit} (${Math.round(f.lower).toLocaleString("en-IN")}–${Math.round(f.upper).toLocaleString("en-IN")})`}</title>
        </circle>
      ))}
      {all.map((d, i) =>
        i % every === 0 || i === all.length - 1 ? (
          <text key={d} x={x(i)} y={H - 9} textAnchor="middle">{`${monthShort(d.slice(0, 7))} ${d.slice(2, 4)}`}</text>
        ) : null,
      )}
      <line className="axis" x1={L} x2={W - R} y1={T + ih} y2={T + ih} />
    </svg>
  );
}
