import { useId, useState } from "react";
import type { SignalDetail, SignalRow } from "@/lib/signal/schema";
import { formatNumber, formatScore } from "@/lib/signal/presentation";
import s from "./FocusDraft.module.css";

export function Arrow({ back = false }: { back?: boolean }) {
  return <span aria-hidden="true">{back ? "←" : "↗"}</span>;
}

export function PriorityPrism({ signal }: { signal: SignalRow }) {
  const id = useId();
  const impact = Number(signal.impact_score);
  const urgency = Number(signal.urgency_score ?? signal.reaction_score);
  const confidence = Number(signal.confidence_score);
  const point = (x: number, y: number, z: number) =>
    `${210 + 130 * x - 130 * y},${310 - 65 * x - 65 * y - 150 * z}`;
  return (
    <div className={s.prism}>
      <svg viewBox="0 0 420 390" role="img" aria-labelledby={id}>
        <title id={id}>
          Priority in three dimensions: impact{" "}
          {formatScore(signal.impact_score)},{" "}
          {signal.urgency_score == null ? "actionability" : "urgency"}{" "}
          {formatScore(signal.urgency_score ?? signal.reaction_score)},
          confidence {formatScore(signal.confidence_score)} out of 100.
        </title>
        <defs>
          <radialGradient id={`${id}-glow`}>
            <stop stopColor="#b9ead6" stopOpacity=".8" />
            <stop offset="1" stopColor="#b9ead6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse
          cx="210"
          cy="220"
          rx="185"
          ry="155"
          fill={`url(#${id}-glow)`}
        />
        <g stroke="#bdc9c1" strokeWidth="1" fill="none">
          <polygon
            points={`${point(0, 0, 0)} ${point(1, 0, 0)} ${point(1, 1, 0)} ${point(0, 1, 0)}`}
            fill="#fff"
            fillOpacity=".12"
          />
          <polygon
            points={`${point(0, 0, 1)} ${point(1, 0, 1)} ${point(1, 1, 1)} ${point(0, 1, 1)}`}
            fill="#fff"
            fillOpacity=".32"
          />
          {[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ].map(([x, y]) => (
            <polyline
              key={`${x}-${y}`}
              points={`${point(x, y, 0)} ${point(x, y, 1)}`}
            />
          ))}
          {[0.25, 0.5, 0.75].map((n) => (
            <g key={n} opacity=".4">
              <polyline
                points={`${point(n, 0, 0)} ${point(n, 1, 0)} ${point(n, 1, 1)}`}
              />
              <polyline
                points={`${point(0, n, 0)} ${point(1, n, 0)} ${point(1, n, 1)}`}
              />
            </g>
          ))}
        </g>
        <polyline
          points={`${point(impact, urgency, 0)} ${point(impact, urgency, confidence)}`}
          stroke="#208567"
          strokeDasharray="3 5"
        />
        <ellipse
          cx={210 + 130 * impact - 130 * urgency}
          cy={310 - 65 * impact - 65 * urgency}
          rx="11"
          ry="5"
          fill="#263e33"
          opacity=".12"
        />
        <circle
          cx={210 + 130 * impact - 130 * urgency}
          cy={310 - 65 * impact - 65 * urgency - 150 * confidence}
          r="22"
          fill="#fff"
          fillOpacity=".4"
        />
        <circle
          cx={210 + 130 * impact - 130 * urgency}
          cy={310 - 65 * impact - 65 * urgency - 150 * confidence}
          r="10"
          fill="#153f32"
          stroke="#fff"
          strokeWidth="3"
        />
        <g fill="#4e6259" fontSize="11" fontFamily="inherit">
          <text x="342" y="265">
            Impact
          </text>
          <text x="29" y="265">
            {signal.urgency_score == null ? "Actionability" : "Urgency"}
          </text>
          <text x="150" y="32" textAnchor="end">
            Confidence
          </text>
        </g>
      </svg>
      <span className={s.prismCaption}>One signal. Three dimensions.</span>
    </div>
  );
}

export function ScoreStrip({ signal }: { signal: SignalRow }) {
  const scores = [
    {
      label: "Impact",
      value: signal.impact_score,
      note: "Relative economic magnitude within this signal type; not a dollar total across types.",
    },
    {
      label: signal.urgency_score == null ? "Actionability" : "Urgency",
      value: signal.urgency_score ?? signal.reaction_score,
      note:
        signal.urgency_score == null
          ? "Published baseline actionability. Deadline-based urgency is unavailable in this release."
          : "How close the conservative start-by deadline is. This does not establish feasibility or authority.",
    },
    {
      label: "Confidence",
      value: signal.confidence_score,
      note: "Published evidence quality; not the probability that the outcome will happen.",
    },
  ];
  return (
    <div className={s.scoreStrip} aria-label="Three-dimensional signal scores">
      {scores.map((score) => (
        <details className={s.score} key={score.label}>
          <summary>
            <span>
              {score.label} <span className={s.info}>ⓘ</span>
            </span>
            <strong>
              {formatScore(score.value)}
              <small>/100</small>
            </strong>
            <span className={s.scoreTrack}>
              <i style={{ width: `${Number(score.value) * 100}%` }} />
            </span>
          </summary>
          <p>{score.note}</p>
        </details>
      ))}
    </div>
  );
}

export function EvidencePicture({ detail }: { detail: SignalDetail }) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const demand = detail.signal.signal_type === "demand_momentum";
  const excess = detail.signal.signal_type === "inventory_imbalance";
  const rows = detail.evidence.filter((row) => row.path === "base");
  if (!rows.length)
    return (
      <p className={s.muted}>
        No base-path rows were published for this signal.
      </p>
    );
  const first = (row: (typeof rows)[number]) =>
    Number(
      demand ? (row.adjusted_forecast_units ?? 0) : (row.ending_units ?? 0),
    );
  const second = (row: (typeof rows)[number]) =>
    Number(
      demand
        ? (row.retailer_forecast_units ?? 0)
        : excess
          ? (row.target_units ?? 0)
          : (row.scheduled_inbound_units ?? 0),
    );
  const max = Math.max(1, ...rows.flatMap((row) => [first(row), second(row)]));
  const barWidth = 560 / rows.length;
  const row = rows[Math.min(selected, rows.length - 1)];
  const secondLabel = demand
    ? "Published baseline"
    : excess
      ? "Policy target"
      : "Expected receipts";
  const firstLabel = demand ? "Momentum-adjusted demand" : "Closing stock";
  return (
    <div className={s.picture}>
      <div className={s.pictureHeading}>
        <h3>
          {demand
            ? "The gap, one day at a time."
            : excess
              ? "Stock above the target has a cost."
              : "Every day of stock matters."}
        </h3>
        <span>Next 28 days · units</span>
      </div>
      <div className={s.pictureKey}>
        <span>
          <i />
          {firstLabel}
        </span>
        <span>
          <i />
          {secondLabel}
        </span>
      </div>
      <svg viewBox="0 0 600 190" role="img" aria-labelledby={id}>
        <title id={id}>
          {firstLabel} compared with {secondLabel.toLowerCase()} across the
          published base path. Use the date slider below for exact quantities.
        </title>
        <line x1="20" x2="580" y1="165" y2="165" stroke="#dedfd9" />
        {rows.map((r, index) => (
          <g
            key={`${r.evidence_date}-${index}`}
            opacity={index === selected ? 1 : 0.65}
          >
            <rect
              x={20 + index * barWidth}
              y={165 - (first(r) / max) * 130}
              width={Math.max(2, barWidth - 5)}
              height={Math.max(1, (first(r) / max) * 130)}
              rx="3"
              fill="var(--draft-accent)"
            />
            <line
              x1={20 + index * barWidth}
              x2={20 + (index + 1) * barWidth - 5}
              y1={165 - (second(r) / max) * 130}
              y2={165 - (second(r) / max) * 130}
              stroke="#555e59"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {index === selected && (
              <line
                x1={20 + index * barWidth + (barWidth - 5) / 2}
                x2={20 + index * barWidth + (barWidth - 5) / 2}
                y1="15"
                y2="174"
                stroke="#28392e"
                strokeDasharray="2 4"
              />
            )}
          </g>
        ))}
      </svg>
      <label className={s.scrubber}>
        Slide to inspect a day
        <input
          type="range"
          min="0"
          max={rows.length - 1}
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
        />
      </label>
      <div className={s.dayReadout}>
        <strong>{row.evidence_date}</strong>
        <span>
          {firstLabel} <b>{formatNumber(first(row))}</b>
        </span>
        <span>
          {secondLabel} <b>{formatNumber(second(row))}</b>
        </span>
        {!demand && !excess && (
          <span>
            Unfulfilled <b>{formatNumber(row.lost_units ?? 0)}</b>
          </span>
        )}
      </div>
    </div>
  );
}
