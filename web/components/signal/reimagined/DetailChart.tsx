"use client";
import { useState } from "react";
import type { DetailsModel } from "@/lib/reimagined/details-model";
import { wholeUnits as number } from "@/lib/reimagined/presentation";
import styles from "./InsightDetails.module.css";

export default function DetailChart({ model }: { model: DetailsModel }) {
  const [history, setHistory] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const zero = model.value.lane === "z",
    past = zero || history;
  const dates = past
    ? Array.from({ length: 56 }, (_, i) =>
        new Date(
          Date.parse(`${model.attention.observation_date}T00:00:00Z`) +
            (i - 55) * 86400000,
        )
          .toISOString()
          .slice(0, 10),
      )
    : model.series.projections
        .filter((row) => row.basis === "firm")
        .map((row) => row.projection_date);
  const firm = new Map(
    model.series.projections
      .filter((row) => row.basis === "firm")
      .map((row) => [row.projection_date, row]),
  );
  const planned = new Map(
    model.series.projections
      .filter((row) => row.basis === "conditional")
      .map((row) => [row.projection_date, row]),
  );
  const historyByDay = new Map(
    model.series.history.map((row) => [row.business_date, row]),
  );
  const values = dates.map((day) => {
    if (!past) return firm.get(day)?.ending_units ?? null;
    const row = historyByDay.get(day);
    if (!row) return null;
    return zero
      ? row.expected_stores > 0 && row.inventory_stores === row.expected_stores
        ? row.zero_stores
        : null
      : row.on_hand;
  });
  const conditional = past
    ? []
    : dates.map((day) => planned.get(day)?.ending_units ?? null);
  const unmet =
    past || model.value.lane !== "a"
      ? []
      : dates.map((day) => planned.get(day)?.unfulfilled_units ?? null);
  const target = !past && model.value.lane === "i" ? model.targetUnits : null;
  const ceiling = Math.max(
    1,
    ...values.map((v) => v ?? 0),
    ...conditional.map((v) => v ?? 0),
    target ?? 0,
  );
  const max = Math.max(4, Math.ceil(ceiling / 4) * 4);
  const maxUnmet = Math.max(1, ...unmet.map((n) => n ?? 0));
  const x = (i: number) => 52 + ((i + 0.5) * 620) / Math.max(1, dates.length),
    y = (n: number) => 190 - (n / max) * 154;
  const path = (points: (number | null)[]) => {
    let active = false;
    return points
      .map((value, i) => {
        if (value === null) {
          active = false;
          return "";
        }
        const command = active ? "L" : "M";
        active = true;
        return `${command}${x(i).toFixed(2)},${y(value).toFixed(2)}`;
      })
      .join(" ");
  };
  const ticks = [
    ...new Set([
      0,
      ...[1, 2, 3, 4, 5].map((n) => Math.floor(((dates.length - 1) * n) / 5)),
    ]),
  ];
  const selected = hover === null ? null : dates[hover];
  const unit = zero ? "stores" : "units";
  const title = zero
    ? "Reported stores at zero"
    : model.value.lane === "i"
      ? "Inventory against cover target"
      : "Inventory and uncovered demand";
  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      {!zero && (
        <div className={styles.controls}>
          <button
            className={styles.button}
            aria-pressed={!history}
            onClick={() => {
              setHistory(false);
              setHover(null);
            }}
          >
            Next 4 wks
          </button>
          <button
            className={styles.button}
            aria-pressed={history}
            onClick={() => {
              setHistory(true);
              setHover(null);
            }}
          >
            Past 8 wks
          </button>
        </div>
      )}
      <div className={styles.legend}>
        <span>
          <i
            className={styles.key}
            style={{ borderColor: zero ? "#d92d20" : "#0a7aff" }}
          />
          {past
            ? zero
              ? "Reported zero inventory"
              : "Observed inventory"
            : "Firm inventory"}
        </span>
        {!past && (
          <span>
            <i
              className={styles.key}
              style={{ borderColor: "#e8890c", borderTopStyle: "dashed" }}
            />
            Including eligible plans · conditional
          </span>
        )}
        {target !== null && (
          <span>
            <i
              className={styles.key}
              style={{ borderColor: "#75756f", borderTopStyle: "dashed" }}
            />
            Declared cover target
          </span>
        )}
      </div>
      {values.some((value) => value !== null) ? (
        <svg
          className={styles.chart}
          viewBox={`0 0 710 ${unmet.length ? 292 : 232}`}
          role="img"
          tabIndex={0}
          onFocus={() => setHover(0)}
          onBlur={() => setHover(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              setHover((current) =>
                Math.max(
                  0,
                  Math.min(
                    dates.length - 1,
                    (current ?? 0) + (event.key === "ArrowRight" ? 1 : -1),
                  ),
                ),
              );
            }
          }}
          aria-label={`${title}, ${unit}, ${past ? "observed history" : "28-day projection"}`}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line
                x1={52}
                x2={672}
                y1={y(tick * max)}
                y2={y(tick * max)}
                stroke="#e9e9e6"
              />
              <text
                x={45}
                y={y(tick * max) + 4}
                textAnchor="end"
                fontSize={11}
                fill="#75756f"
              >
                {number(tick * max)}
              </text>
            </g>
          ))}
          <text x={52} y={17} fontSize={11} fill="#75756f">
            {unit} · {past ? "observed" : "projected"}
          </text>
          {zero ? (
            values.map((value, i) =>
              value === null ? null : (
                <rect
                  key={dates[i]}
                  x={x(i) - Math.max(1, 620 / dates.length / 3)}
                  y={y(value)}
                  width={Math.max(2, (620 / dates.length) * 0.6)}
                  height={190 - y(value)}
                  fill="#d92d20"
                />
              ),
            )
          ) : (
            <path
              d={path(values)}
              fill="none"
              stroke="#0a7aff"
              strokeWidth={2.5}
            />
          )}
          {!past && (
            <path
              d={path(conditional)}
              fill="none"
              stroke="#e8890c"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
          {target !== null && (
            <line
              x1={52}
              x2={672}
              y1={y(target)}
              y2={y(target)}
              stroke="#75756f"
              strokeDasharray="4 4"
            />
          )}
          {ticks.map(
            (i) =>
              dates[i] && (
                <text
                  key={i}
                  x={x(i)}
                  y={212}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#75756f"
                >
                  {dates[i].slice(5)}
                </text>
              ),
          )}
          {unmet.length > 0 && (
            <>
              <text x={52} y={240} fontSize={11} fill="#d92d20">
                Uncovered units / day · including plans · scale 0–
                {number(maxUnmet)}
              </text>
              {unmet.map((value, i) =>
                value === null ? null : (
                  <rect
                    key={dates[i]}
                    x={x(i) - 6}
                    y={278 - (28 * value) / maxUnmet}
                    width={12}
                    height={(28 * value) / maxUnmet}
                    fill="#d92d20"
                  />
                ),
              )}
            </>
          )}
          {dates.map((day, i) => (
            <rect
              key={day}
              x={52 + (i * 620) / dates.length}
              y={25}
              width={620 / dates.length}
              height={168}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            >
              <title>{`${day}: ${number(values[i])} ${unit}${!past ? `; including plans ${number(conditional[i])}` : ""}`}</title>
            </rect>
          ))}
        </svg>
      ) : (
        <p className={styles.muted}>
          A complete inventory series is unavailable for this scope. Individual
          store evidence remains available below.
        </p>
      )}
      <div className={styles.readout} aria-live="polite">
        {selected && hover !== null
          ? `${selected} · ${past ? "Observed" : "Firm"}: ${number(values[hover])} ${unit}${!past ? ` · Including plans: ${number(conditional[hover])} units` : ""}${unmet.length ? ` · Uncovered: ${number(unmet[hover])} units` : ""}`
          : "Hover or focus the chart and use arrow keys for dated values. Units are rounded for display; exports retain exact values."}
      </div>
      <p className={styles.muted}>
        {zero
          ? "Historical zero counts for the same affected-store cohort, not all stores. Incomplete inventory coverage is shown as a gap."
          : past
            ? "Observed inventory across this finding’s affected stores. Missing observations are not zero."
            : "Firm and including-plans lines are alternatives, never additive. Positive aggregate stock can coexist with shortages at individual stores."}
      </p>
    </section>
  );
}
