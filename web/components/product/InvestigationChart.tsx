"use client";

import { useId, useState } from "react";
import styles from "./Investigation.module.css";
import { formatNumber } from "@/lib/signal/presentation";

export type ChartPoint = {
  key: string;
  date: string;
  primary: number | null;
  secondary?: number | null;
  bar?: number | null;
  shade?: number | null;
  loss?: number | null;
  receipt?: number | null;
  receiptKind?: "observed" | "firm" | "assumed" | "mixed";
  recent?: boolean;
  projected: boolean;
  note?: string;
};
export default function InvestigationChart({
  title,
  points,
  unit,
  primaryLabel,
  secondaryLabel,
  selected,
  onSelect,
  materialDate,
}: {
  title: string;
  points: ChartPoint[];
  unit: string;
  primaryLabel: string;
  secondaryLabel?: string;
  selected: string | null;
  onSelect: (point: ChartPoint) => void;
  materialDate?: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<string | null>(null);
  const active = points.find((p) => p.key === (hover ?? selected));
  const values = points.flatMap((p) =>
    [p.primary, p.secondary, p.bar].filter((n): n is number => n != null),
  );
  const max = Math.max(1, ...values) * 1.15;
  const min = Math.min(0, ...values);
  const first = Date.parse(points[0]?.date ?? "2027-01-01");
  const last = Date.parse(points.at(-1)?.date ?? "2027-01-02");
  const dateX = (date: string) =>
    56 + ((Date.parse(date) - first) * 720) / Math.max(1, last - first);
  const x = (i: number) =>
    dateX(points[i]?.date ?? points[0]?.date ?? "2027-01-01");
  const y = (n: number) => 224 - ((n - min) / (max - min)) * 184;
  const paths = (field: "primary" | "secondary", future: boolean) => {
    let started = false;
    return points
      .map((p, i) => {
        const n = p[field];
        if (n == null || p.projected !== future) {
          started = false;
          return "";
        }
        const command = started ? "L" : "M";
        started = true;
        return `${command}${x(i).toFixed(2)},${y(n).toFixed(2)}`;
      })
      .join(" ");
  };
  const boundary = points.findIndex((p) => p.projected);
  const milestone = materialDate ? dateX(materialDate) : null;
  const index = points.findIndex((p) => p.key === selected);
  return (
    <section className={styles.chartPanel} aria-label={title}>
      <div className={styles.chartHead}>
        <h3>{title}</h3>
        <span>{unit}</span>
      </div>
      <div className={styles.legend}>
        <span>
          <i />
          {primaryLabel}
        </span>
        {secondaryLabel && (
          <span>
            <i className={styles.neutral} />
            {secondaryLabel}
          </span>
        )}
        <span>
          <i className={styles.orange} />
          Exposure / pinned selection
        </span>
        <span>Dashed = projection</span>
      </div>
      <svg
        viewBox="0 0 810 275"
        role="img"
        aria-labelledby={id}
        className={styles.chart}
      >
        <title id={id}>
          {title}. Use the date controls below to inspect the same data with
          keyboard or touch.
        </title>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1="56"
              x2="776"
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="#ececef"
            />
            <text x="46" y={y(max * f) + 4} textAnchor="end">
              {formatNumber(max * f)}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.key}>
            {p.shade != null &&
              p.shade > 0 &&
              p.primary != null &&
              p.secondary != null && (
                <rect
                  x={x(i) - 3}
                  y={y(Math.max(p.primary, p.secondary))}
                  width={Math.max(6, 720 / points.length)}
                  height={Math.max(1, Math.abs(y(p.secondary) - y(p.primary)))}
                  fill="#ff9500"
                  opacity=".16"
                />
              )}
            {p.bar != null && (
              <rect
                x={x(i) - 3}
                y={y(Math.max(p.bar, 0))}
                width={Math.max(4, 600 / points.length)}
                height={Math.abs(y(0) - y(p.bar))}
                fill={p.recent ? "#ff9500" : "#0a7aff"}
                opacity={p.recent ? ".35" : ".18"}
              />
            )}
            {p.loss != null && p.loss > 0 && (
              <rect
                x={x(i) - 2}
                y="232"
                width={Math.max(4, 600 / points.length)}
                height="8"
                fill="#ff9500"
              >
                <title>
                  {p.date}: {formatNumber(p.loss)} unfulfilled units
                </title>
              </rect>
            )}
            {p.receipt != null && p.receipt > 0 && (
              <path
                d={`M${x(i) - 3},45 l3,-5 l3,5 z`}
                fill={p.receiptKind === "assumed" ? "white" : "#0a7aff"}
                stroke="#0a7aff"
                strokeDasharray={p.receiptKind === "mixed" ? "1 1" : undefined}
              >
                <title>
                  {p.receiptKind} · {p.date}: receipt {formatNumber(p.receipt)}{" "}
                  units
                </title>
              </path>
            )}
          </g>
        ))}
        {[false, true].map((future) => (
          <g key={String(future)}>
            <path
              d={paths("primary", future)}
              fill="none"
              stroke="#0a7aff"
              strokeWidth="2.5"
              strokeDasharray={future ? "5 4" : undefined}
            />
            <path
              d={paths("secondary", future)}
              fill="none"
              stroke="#8e8e93"
              strokeWidth="1.7"
              strokeDasharray={future ? "5 4" : undefined}
            />
          </g>
        ))}
        {boundary > 0 && (
          <g>
            <line
              x1={x(boundary) - 4}
              x2={x(boundary) - 4}
              y1="28"
              y2="228"
              stroke="#aaa"
              strokeDasharray="2 4"
            />
            <text x={x(boundary) - 8} y="20" textAnchor="end">
              Snapshot
            </text>
          </g>
        )}
        {milestone !== null && milestone >= 56 && milestone <= 776 && (
          <g>
            <line
              x1={milestone}
              x2={milestone}
              y1="35"
              y2="228"
              stroke="#ff9500"
              strokeDasharray="3 5"
            />
            <text x={Math.min(740, milestone + 5)} y="32">
              Impact milestone
            </text>
          </g>
        )}
        {index >= 0 && (
          <line x1={x(index)} x2={x(index)} y1="40" y2="230" stroke="#ff9500" />
        )}
        {points.map((p, i) => (
          <g
            key={p.key}
            onMouseEnter={() => setHover(p.key)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect(p)}
            className={styles.hit}
          >
            <title>{`${p.date} · ${primaryLabel}: ${p.primary == null ? "unavailable" : formatNumber(p.primary)} ${unit} · ${p.note ?? ""}`}</title>
            <rect
              x={x(i) - Math.max(5, 350 / points.length)}
              y="40"
              width={Math.max(10, 700 / points.length)}
              height="185"
              fill="transparent"
            />
            {p.primary != null && (
              <circle
                cx={x(i)}
                cy={y(p.primary)}
                r={p.key === selected ? 5 : 2}
                fill={p.key === selected ? "#ff9500" : "#0a7aff"}
              />
            )}
          </g>
        ))}
        {[0, Math.floor(points.length / 2), points.length - 1]
          .filter((i, pos, a) => a.indexOf(i) === pos && i >= 0)
          .map((i) => (
            <text key={i} x={x(i)} y="256" textAnchor="middle">
              {points[i]?.date}
            </text>
          ))}
      </svg>
      <p className={styles.readout} role="status">
        {active
          ? `${active.date} · ${primaryLabel}: ${active.primary == null ? "unavailable" : formatNumber(active.primary)} ${unit}${active.secondary != null ? ` · ${secondaryLabel}: ${formatNumber(active.secondary)}` : ""} · ${active.note ?? (active.projected ? "Projected" : "Observed")}`
          : "Select a date or week to explain this result. Hover only previews the values."}
      </p>
      <div className={styles.datePicker}>
        <label>
          Inspect date / week{" "}
          <select
            aria-label={`Inspect ${title} date`}
            value={selected ?? ""}
            onChange={(e) => {
              const point = points.find((p) => p.key === e.target.value);
              if (point) onSelect(point);
            }}
          >
            <option value="" disabled>
              Select…
            </option>
            {points.map((p) => (
              <option key={p.key} value={p.key}>
                {p.date}
                {p.note ? ` · ${p.note}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
