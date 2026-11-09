import type { SignalDetail } from "@/lib/signal/schema";
import { dateLabel, number } from "@/lib/signal/presentation";
import styles from "./Signal.module.css";

// Only map published evidence to coordinates. No business metrics are calculated here.
export default function EvidenceChart({ detail }: { detail: SignalDetail }) {
  const demand = detail.signal.signal_type === "demand_momentum";
  const rows = detail.evidence.filter((e) => demand ? e.evidence_type === "historical_week" : e.path === "base").sort((a, b) => a.evidence_date.localeCompare(b.evidence_date));
  const series = demand ? [
    { label: "Actual units", color: "#2263bf", values: rows.map((e) => e.actual_units) },
    { label: "Retailer forecast", color: "#a76015", values: rows.map((e) => e.retailer_forecast_units) },
  ] : [
    { label: "Base ending inventory", color: "#2263bf", values: rows.map((e) => e.ending_units) },
    { label: "Dated inbound", color: "#258073", values: rows.map((e) => e.scheduled_inbound_units) },
    ...(detail.signal.signal_type === "inventory_imbalance" ? [{ label: "Published target", color: "#a76015", values: rows.map((e) => e.target_units) }] : []),
  ];
  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => v === null ? 0 : Number(v))));
  const x = (i: number) => 48 + i * 510 / Math.max(rows.length - 1, 1);
  const y = (value: string) => 190 - Number(value) / max * 150;
  const title = demand ? "Actual demand versus forecast" : "Projected inventory and inbound";
  return <figure className={styles.chart}><figcaption><strong>{title}</strong><p>{demand ? "Six baseline weeks, followed by two recent weeks. Dates are published evidence labels." : "28-day base projection · end-of-day book inventory, not shelf availability."}</p></figcaption>
    <svg viewBox="0 0 590 235" role="img" aria-label={title}><title>{title}</title><desc>{demand ? "Blue is actual units; amber is retailer forecast. The shaded final two observations are the recent weeks." : "Blue is projected ending inventory; green is inbound. An amber line marks the target when applicable. Exact values are available in the evidence table."}</desc>
      {demand && <rect x={x(6) - 16} y="28" width={590 - x(6) + 5} height="162" fill="#eaf0fa" />}
      {[0, 0.5, 1].map((ratio) => <g key={ratio}><line x1="48" x2="558" y1={190 - ratio * 150} y2={190 - ratio * 150} stroke="#dce2ea" /><text x="42" y={194 - ratio * 150} textAnchor="end" fontSize="11" fill="#596679">{number(String(max * ratio))}</text></g>)}
      <text x="48" y="18" fontSize="11" fill="#596679">Units</text>
      {series.map((s) => <g key={s.label}>{s.values.map((v, i) => v === null ? null : <g key={i}>{i > 0 && s.values[i - 1] !== null && <line x1={x(i - 1)} y1={y(s.values[i - 1]!)} x2={x(i)} y2={y(v)} stroke={s.color} strokeWidth="2" />}<circle cx={x(i)} cy={y(v)} r="3" fill={s.color}><title>{`${rows[i].evidence_date}: ${s.label} ${number(v)}`}</title></circle></g>)}</g>)}
      <text x="48" y="214" fontSize="11" fill="#596679">{dateLabel(rows[0].evidence_date)}</text><text x="558" y="214" fontSize="11" fill="#596679" textAnchor="end">{dateLabel(rows.at(-1)!.evidence_date)}</text>
      {demand && <text x={x(6) - 12} y="31" fontSize="10" fill="#596679">Recent 2 weeks</text>}
    </svg><div className={styles.chartLegend}>{series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}</div>
  </figure>;
}
