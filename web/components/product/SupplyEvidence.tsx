import type { SignalDetail } from "@/lib/signal/schema";
import { formatNumber as number } from "@/lib/signal/presentation";

export function SupplyEvidence({ detail }: { detail: SignalDetail }) {
  const context = detail.supply_context;
  if (!context) return null;
  return (
    <section aria-label="Supply and action evidence">
      <h3>Supply timing and execution feasibility</h3>
      <p>
        {context.assumption_version} · {context.category} · illustrative route{" "}
        {context.route}. Stock, capacity, and authority are not confirmed.
        Urgency is a separate decision deadline, not an executable-action score.
      </p>
      <dl>
        {Object.entries(context.supply_timing).map(([name, projection]) => (
          <div key={name}>
            <dt>
              {name === "committed"
                ? "Committed supply only"
                : `Planned supply · ${name} arrivals`}
            </dt>
            <dd>
              First projected zero:{" "}
              {projection.first_oos_date ?? "none in horizon"} ·{" "}
              {number(String(projection.lost_units))} projected lost units
            </dd>
          </div>
        ))}
      </dl>
      <p>
        {context.planned_replenishment.length} anticipated order lines; these
        are not purchase orders. Unverified:{" "}
        {context.planning_prerequisites.join(", ").replaceAll("_", " ")}.
      </p>
      {context.planned_replenishment.length > 0 && (
        <>
          <h4>Anticipated order schedule</h4>
          <ul>
            {context.planned_replenishment.map((row, index) => (
              <li key={index}>
                Order {row.planned_order_date}: {number(String(row.quantity))}{" "}
                units · receipts {row.early} / {row.typical} /{" "}
                {row.conservative} (early / typical / conservative).
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Firm inbound arrival ranges</h4>
      {context.arrivals.length === 0 ? (
        <p>No outstanding firm inbound.</p>
      ) : (
        <ul>
          {context.arrivals.map((row, index) => (
            <li key={index}>
              {row.order_state.replaceAll("_", " ")} ·{" "}
              {number(String(row.quantity))} units · {row.early ?? "overdue"} /{" "}
              {row.typical ?? "overdue"} / {row.conservative ?? "overdue"}{" "}
              (early / typical / conservative) ·{" "}
              {row.basis.replaceAll("_", " ")}
            </li>
          ))}
        </ul>
      )}
      <h4>Action options, subject to prerequisites</h4>
      {context.actions.length === 0 ? (
        <p>
          No supported supply intervention for this signal direction.
          Actionability is zero.
        </p>
      ) : (
        <ul>
          {context.actions.map((action) => (
            <li key={action.action}>
              <strong>{action.action.replaceAll("_", " ")}</strong>:{" "}
              {action.early_days} / {action.typical_days} /{" "}
              {action.conservative_days} calendar days · typical slack{" "}
              {action.typical_slack}, conservative slack{" "}
              {action.conservative_slack} · timing {action.timing}, feasibility{" "}
              {action.feasibility}.<br />
              Stages: {action.stages.join(" → ").replaceAll("_", " ")}.<br />
              Missing prerequisites:{" "}
              {action.missing_prerequisites.join(", ").replaceAll("_", " ") ||
                "none"}
              .
            </li>
          ))}
        </ul>
      )}
      <p>
        {context.ranking_policy}. Baseline reaction score:{" "}
        {context.baseline_reaction_score}. Committed-supply overall rank:{" "}
        {context.committed_overall_rank ?? "not a committed-supply candidate"};
        score {context.committed_rank_score ?? "—"}.
      </p>
    </section>
  );
}
