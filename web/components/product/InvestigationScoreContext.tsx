import type { SignalDetail } from "@/lib/signal/schema";
import {
  decisionSummary,
  formatScore,
  humanize,
} from "@/lib/signal/presentation";
import styles from "./Investigation.module.css";

type Context = "urgency" | "confidence";

export default function InvestigationScoreContext({
  context,
  detail,
  demand,
  onClose,
}: {
  context: Context;
  detail: SignalDetail;
  demand: boolean;
  onClose: () => void;
}) {
  const signal = detail.signal;
  if (context === "confidence") {
    return (
      <div className={styles.timeline}>
        <strong>Evidence confidence, not probability</strong>
        <div className={styles.cards}>
          <Fact
            label="Forecast quality"
            value={formatScore(signal.forecast_quality)}
          />
          <Fact
            label="Completeness"
            value={formatScore(signal.data_completeness)}
          />
          <Fact label="Stability" value={formatScore(signal.stability_score)} />
        </div>
        <p>
          {signal.ranker_version === "memento-signal-urgency-ranker-v2"
            ? "Confidence is the product of these three published inputs."
            : "Confidence uses the scoring policy declared by this release."}
        </p>
        <CloseButton onClose={onClose} />
      </div>
    );
  }

  const actionHorizon = Math.max(
    28,
    signal.days_until_material_impact,
    ...(detail.supply_context?.actions.map(
      (action) => action.conservative_days,
    ) ?? []),
  );
  return (
    <div className={styles.timeline}>
      <strong>{decisionSummary(signal)}</strong>
      <p>
        {demand
          ? "Material impact is the half-gap milestone, not a stockout date."
          : "This is the published material-impact timing."}{" "}
        Urgency does not confirm stock, capacity, or authority. Bars show
        conservative completion from the snapshot; the blue marker is material
        impact at {signal.days_until_material_impact} days, on a {actionHorizon}
        -day scale.
      </p>
      {detail.supply_context?.actions.map((action) => (
        <div key={action.action}>
          <span>
            {humanize(action.action)} · {action.early_days}/
            {action.typical_days}/{action.conservative_days} calendar days ·{" "}
            {action.feasibility}
          </span>
          <div className={styles.timelineBar}>
            <span
              style={{
                width: `${Math.min(100, (action.conservative_days / actionHorizon) * 100)}%`,
              }}
            />
            <i
              className={styles.impactMarker}
              style={{
                left: `${(signal.days_until_material_impact / actionHorizon) * 100}%`,
              }}
            />
          </div>
          <p>
            Typical slack {action.typical_slack}; conservative slack{" "}
            {action.conservative_slack} days.
          </p>
          <p>
            {action.stages.map(humanize).join(" → ")}. Missing:{" "}
            {action.missing_prerequisites.map(humanize).join(", ") || "none"}.
          </p>
        </div>
      ))}
      {!detail.supply_context?.actions.length && (
        <p>
          Declared review/replan allowance; no supported supply intervention for
          this direction.
        </p>
      )}
      <CloseButton onClose={onClose} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      {label}
      <strong>{value}</strong>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button className={styles.action} onClick={onClose}>
      Close score context
    </button>
  );
}
