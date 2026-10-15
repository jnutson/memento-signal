"use client";

import Link from "next/link";
import { ReleaseGate } from "./ReleaseProvider";
import { calibrationNotice, type SignalRow } from "@/lib/signal/schema";
import {
  formatCutoff,
  formatMoney,
  formatNumber,
  humanize,
  signalLabels,
} from "@/lib/signal/presentation";
import s from "./OriginalDemo.module.css";
import a from "./Adaptation.module.css";

export default function Monday() {
  return (
    <ReleaseGate>
      {(queue) => {
        const first = queue.signals[0];
        const momentum = queue.signals.filter(
          (row) => row.signal_type === "demand_momentum",
        );
        const up = momentum
          .filter((row) => row.signal_direction === "acceleration")
          .slice(0, 2);
        const down = momentum
          .filter((row) => row.signal_direction === "deceleration")
          .slice(0, 2);
        return (
          <article className={s.paper}>
            <div className={s.masthead}>
              <span>{formatCutoff(queue.run.signal_as_of)} · UTC</span>
              <span>Signal briefing</span>
            </div>
            <h1 className={s.mHead}>
              {first
                ? `${first.identity.item_name} leads the current queue. ${queue.run.candidate_counts_by_type.demand_momentum.toLocaleString("en-US")} demand signals and ${queue.run.candidate_counts_by_type.availability} availability risks qualified.`
                : "No signals in the published queue."}
            </h1>
            <p className={s.lede}>
              <b>{formatNumber(queue.run.candidate_count)}</b> eligible
              store–item signals. The briefing shows the {queue.signals.length}{" "}
              highest-ranked observations, not the entire business.
            </p>
            <section className={s.priority} aria-label="Priority">
              <h2 className={s.secHead}>Start here</h2>
              <ol>
                {queue.signals.slice(0, 3).map((signal) => (
                  <li key={signal.signal_id}>
                    <span>
                      <b>{signal.identity.item_name}.</b>{" "}
                      {signalLabels[signal.signal_type]} at{" "}
                      {signal.identity.store_name} · impact within{" "}
                      {signal.days_until_material_impact} days.
                    </span>
                    <Link
                      className={s.link}
                      href={`/attention?signal=${signal.signal_id}`}
                    >
                      Review →
                    </Link>
                  </li>
                ))}
              </ol>
              {!first && (
                <p className={s.sub}>
                  This does not guarantee the absence of business risk.
                </p>
              )}
            </section>
            <div className={s.movers}>
              <Movers title="Demand accelerating" rows={up} />
              <Movers title="Demand slowing" rows={down} />
            </div>
            <details className={a.disclosure}>
              <summary>About this briefing</summary>
              <p>
                This is a signal briefing, not a weekly POS report. Weekly
                sales, year-over-year comparisons, and historical report
                archives are not connected to the current serving API.
              </p>
              <p>
                {calibrationNotice(queue.run.calibration_status) ??
                  "Synthetic engineering release. Commercial and operational calibration has not been verified."}
              </p>
              <Link className={s.link} href="/reports">
                Read the release report →
              </Link>
            </details>
          </article>
        );
      }}
    </ReleaseGate>
  );
}
function Movers({ title, rows }: { title: string; rows: SignalRow[] }) {
  return (
    <section>
      <h2 className={s.secHead}>{title}</h2>
      {rows.map((row) => (
        <div key={row.signal_id} className={s.mover}>
          <div className={s.moverTop}>
            <b>{row.identity.item_name}</b>
            <span
              className={
                row.signal_direction === "acceleration" ? s.up : s.down
              }
            >
              {formatNumber(row.headline_metric_value)} units
            </span>
          </div>
          <p className={s.why}>
            {row.identity.store_name} · {humanize(row.headline_metric_name)}.{" "}
            {formatMoney(row.estimated_retail_sales_impact_amount)} forward
            retail-sales gap magnitude, not realized revenue.
          </p>
        </div>
      ))}
      {!rows.length && (
        <p className={s.sub}>None in the published overall top ten.</p>
      )}
    </section>
  );
}
