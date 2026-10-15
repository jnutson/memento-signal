import type { SignalRow } from "@/lib/signal/schema";
import {
  decisionSummary,
  formatScore,
  humanize,
  impactSummary,
  signalLabels,
} from "@/lib/signal/presentation";
import adaptation from "./Adaptation.module.css";
import original from "./OriginalAttention.module.css";

export default function AttentionFeed({
  signals,
  selectedId,
  onInspect,
}: {
  signals: SignalRow[];
  selectedId: string | null;
  onInspect: (signalId: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <section className={adaptation.feed} aria-label="Attention feed">
      <h2 className="sr-only">Ranked by priority</h2>
      {signals.map((signal) => (
        <article
          key={signal.signal_id}
          className={`${adaptation.feedCard} ${selectedId === signal.signal_id ? adaptation.feedSelected : ""}`}
        >
          <div className={adaptation.feedHeading}>
            <span className={adaptation.feedRank}>
              {signal.overall_rank_position}
            </span>
            <h2>
              {signal.identity.item_name}{" "}
              <span>· {signalLabels[signal.signal_type]}</span>
            </h2>
            <span>{formatScore(signal.rank_score)} priority</span>
          </div>
          <p className={adaptation.readout}>
            {signal.identity.store_name} · {humanize(signal.signal_direction)}
          </p>
          <p className={adaptation.impact}>{impactSummary(signal)}</p>
          <p className={adaptation.readout}>{decisionSummary(signal)}</p>
          <div className={adaptation.feedFooter}>
            <span>
              Impact {formatScore(signal.impact_score)} ·{" "}
              {signal.urgency_score == null
                ? `Baseline actionability ${formatScore(signal.reaction_score)}`
                : `Urgency ${formatScore(signal.urgency_score)}`}{" "}
              · Confidence {formatScore(signal.confidence_score)}
            </span>
            <button
              className={original.btn}
              aria-label={`#${signal.overall_rank_position} · ${signalLabels[signal.signal_type]} · ${signal.identity.item_name} · ${signal.identity.store_name}`}
              onClick={(event) =>
                onInspect(signal.signal_id, event.currentTarget)
              }
            >
              Inspect evidence →
            </button>
          </div>
          <p className={adaptation.readout}>
            Scores / 100. Confidence is evidence quality, not probability.
            Urgency does not confirm feasibility or authority.
          </p>
        </article>
      ))}
      {!signals.length && (
        <p className={adaptation.readout}>
          No displayed signals of this type in the overall top ten.
        </p>
      )}
    </section>
  );
}
