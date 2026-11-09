"use client";
import { useEffect, useRef, useState } from "react";
import { day, number } from "@/lib/core/format";
import css from "./Core.module.css";

export type ChartRow = { date: string; values: (number | null)[] };
type Props = {
  title: string;
  unit: string;
  rows: ChartRow[];
  labels: string[];
  format?: (v: number | null) => string;
};
const colors = ["#2a78d6", "#eb6834"];

// Demo interaction port: nearest date across the plot, horizontal/vertical
// gridlines, keyboard selection, and explicit gaps. No business arithmetic here.
export function TimeChart({
  title,
  unit,
  rows,
  labels,
  format = number,
}: Props) {
  const [selected, setSelected] = useState(Math.max(0, rows.length - 1));
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(860);
  useEffect(() => {
    const element = svg.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const measured = Math.max(
        480,
        Math.round(element.getBoundingClientRect().width),
      );
      setWidth((previous) => (previous === measured ? previous : measured));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rows.length]);
  if (!rows.length)
    return (
      <p className={css.notice}>
        No dated evidence is available for this scope.
      </p>
    );
  const active = Math.min(hover ?? selected, rows.length - 1);
  const values = rows
    .flatMap((r) => r.values)
    .filter((v): v is number => v !== null);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const floor = min < 0 ? min * 1.1 : 0,
    ceiling = max * 1.1;
  const height = 290,
    left = 72,
    right = 24,
    top = 24,
    bottom = 48;
  const x = (i: number) =>
    left + (i * (width - left - right)) / Math.max(1, rows.length - 1);
  const y = (v: number) =>
    top + ((ceiling - v) * (height - top - bottom)) / (ceiling - floor);
  const path = (series: number) => {
    let previous = false;
    return rows
      .map((r, i) => {
        const value = r.values[series];
        if (value == null) {
          previous = false;
          return "";
        }
        const command = `${previous ? "L" : "M"}${x(i)},${y(value)}`;
        previous = true;
        return command;
      })
      .join(" ");
  };
  const describe = (index: number) =>
    `${day(rows[index].date)}. ${labels.map((l, j) => `${l}: ${format(rows[index].values[j])}`).join(". ")}`;
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      {labels.length > 1 && (
        <div className={css.legend}>
          {labels.map((l) => (
            <span key={l}>
              <i aria-hidden="true" />
              {l}
            </span>
          ))}
        </div>
      )}
      <div className={css.plot}>
        <div className={css.chartScroll}>
          <svg
            ref={svg}
            viewBox={`0 0 ${width} ${height}`}
            role="group"
            aria-label={`${title}, ${unit}`}
          >
            <text x={left} y="13" className={css.chartText}>
              {unit}
            </text>
            {[0, 1, 2, 3, 4].map((i) => {
              const value = floor + ((ceiling - floor) * i) / 4;
              return (
                <g key={i}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y(value)}
                    y2={y(value)}
                    className={css.gridline}
                  />
                  <text
                    x={left - 10}
                    y={y(value) + 4}
                    textAnchor="end"
                    className={css.chartText}
                  >
                    {number(value)}
                  </text>
                </g>
              );
            })}
            {rows.map((r, i) => (
              <g key={r.date}>
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={top}
                  y2={height - bottom}
                  className={css.gridline}
                />
                {((i % Math.max(1, Math.ceil(rows.length / 6)) === 0 &&
                  rows.length - 1 - i >=
                    Math.max(1, Math.ceil(rows.length / 6))) ||
                  i === rows.length - 1) && (
                  <text
                    x={x(i)}
                    y={height - bottom + 23}
                    textAnchor="middle"
                    className={css.chartText}
                  >
                    {new Date(r.date + "T00:00:00Z").toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", timeZone: "UTC" },
                    )}
                  </text>
                )}
              </g>
            ))}
            {labels.map((l, j) => (
              <path
                key={l}
                d={path(j)}
                stroke={colors[j]}
                fill="none"
                strokeWidth="2"
                strokeDasharray={j === 1 ? "6 4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line
              x1={x(active)}
              x2={x(active)}
              y1={top}
              y2={height - bottom}
              stroke="#64788e"
              strokeDasharray="3 4"
            />
            {rows[active].values.map((v, j) =>
              v == null ? null : (
                <circle
                  key={j}
                  cx={x(active)}
                  cy={y(v)}
                  r="4"
                  fill={colors[j]}
                  stroke="white"
                  strokeWidth="2"
                />
              ),
            )}
            {rows.map((r, i) => (
              <rect
                key={r.date}
                className={css.hit}
                x={i === 0 ? left : (x(i - 1) + x(i)) / 2}
                y={top}
                width={
                  ((width - left - right) / Math.max(1, rows.length - 1)) *
                  (i === 0 || i === rows.length - 1 ? 0.5 : 1)
                }
                height={height - top - bottom}
                role="button"
                tabIndex={i === Math.min(selected, rows.length - 1) ? 0 : -1}
                aria-label={describe(i)}
                onPointerMove={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onClick={() => setSelected(i)}
                onFocus={() => {
                  setSelected(i);
                  setHover(null);
                }}
                onKeyDown={(e) => {
                  const next =
                    e.key === "ArrowRight"
                      ? Math.min(rows.length - 1, i + 1)
                      : e.key === "ArrowLeft"
                        ? Math.max(0, i - 1)
                        : e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? rows.length - 1
                            : null;
                  if (next !== null) {
                    e.preventDefault();
                    setSelected(next);
                    e.currentTarget.parentElement
                      ?.querySelectorAll<SVGRectElement>('[role="button"]')
                      [next]?.focus();
                  }
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(i);
                  }
                }}
              />
            ))}
            <text
              x={width - right}
              y={height - 3}
              textAnchor="end"
              className={css.chartText}
            >
              Date
            </text>
          </svg>
        </div>
        {hover !== null && (
          <div role="tooltip" className={css.tooltip}>
            <strong>{day(rows[active].date)}</strong>
            {labels.map((l, j) => (
              <div key={l}>
                {format(rows[active].values[j])} · {l}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className={css.readout} aria-live="polite">
        <strong>{day(rows[active].date)}</strong>
        {labels
          .map((l, j) => `${l}: ${format(rows[active].values[j])}`)
          .join(" · ")}
      </p>
    </section>
  );
}
