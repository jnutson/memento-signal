"use client";

import { ReleaseGate } from "./ReleaseProvider";
import Number from "./NumberFact";
import { calibrationNotice } from "@/lib/signal/schema";
import {
  displayedEconomics,
  formatCutoff,
  formatMoney,
  formatNumber,
  humanize,
  signalLabels,
  signalTypes,
} from "@/lib/signal/presentation";
import styles from "./Product.module.css";

export default function Reports() {
  return (
    <ReleaseGate>
      {(queue) => {
        const economics = displayedEconomics(queue);
        return (
          <article className={styles.paper}>
            <div className={styles.masthead}>
              <span>Memento · Published release</span>
              <span>{formatCutoff(queue.run.signal_as_of)} · UTC</span>
            </div>
            <h1 className={styles.headline}>Reports</h1>
            <p className={styles.lede}>
              What qualified, what reached the queue, and which release it came
              from.
            </p>
            {queue.run.priority_policy && (
              <section className={styles.section}>
                <h2>Priority policy</h2>
                <p>
                  40% impact + 40% urgency + 20% confidence. Urgency increases
                  as the conservative start-by deadline approaches: clamp(1 −
                  decision slack / 28, 0, 1). Confidence = forecast quality ×
                  completeness × stability; it is not a probability.
                </p>
                <p>
                  Impact is an economic percentile within signal type, not a
                  dollar amount. Review/replan allowances are used where no
                  supply intervention is modeled. Unknown prerequisites never
                  become permission to execute.
                </p>
                <dl className={styles.lineage}>
                  <div>
                    <dt>Urgency policy</dt>
                    <dd>{queue.run.priority_policy}</dd>
                  </div>
                  <div>
                    <dt>Confidence policy</dt>
                    <dd>{queue.run.confidence_policy}</dd>
                  </div>
                  <div>
                    <dt>Parent signal release</dt>
                    <dd>{queue.run.source_signal_set_id}</dd>
                  </div>
                </dl>
              </section>
            )}
            <section className={styles.section}>
              <h2>Signal coverage</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table} aria-label="Signal coverage">
                  <thead>
                    <tr>
                      <th>Signal type</th>
                      <th>Eligible in full run</th>
                      <th>In overall top ten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signalTypes.map((type) => (
                      <tr key={type}>
                        <td>{signalLabels[type]}</td>
                        <td>
                          {formatNumber(
                            queue.run.candidate_counts_by_type[type],
                          )}
                        </td>
                        <td>
                          {
                            queue.signals.filter(
                              (signal) => signal.signal_type === type,
                            ).length
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <td>{formatNumber(queue.run.candidate_count)}</td>
                      <td>{queue.signals.length}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className={styles.note}>
                Counts refer to store–item observations. The API publishes only
                the overall top ten; these are not the top ten of each type.
              </p>
            </section>
            <section className={styles.section}>
              <h2>Displayed queue economics · 28 days</h2>
              <dl className={styles.facts}>
                <Number
                  label="Availability · lost retail sales"
                  value={formatMoney(economics.availability)}
                />
                <Number
                  label="Demand · retail sales gap magnitude"
                  value={formatMoney(economics.demand)}
                />
                <Number
                  label="Inventory · capital exposed"
                  value={formatMoney(economics.inventory)}
                />
                <Number
                  label="Inventory · carrying cost"
                  value={formatMoney(economics.carrying)}
                />
              </dl>
              <p>
                Amounts cover displayed rows only. Demand gap magnitude is not
                realized revenue; inventory capital is not lost sales. These
                different economic bases must not be added into a single
                business-impact total.
              </p>
            </section>
            {queue.run.supply_projection_counts && (
              <section className={styles.section}>
                <h2>Supply assumption comparison</h2>
                <div className={styles.tableWrap}>
                  <table
                    className={styles.table}
                    aria-label="Supply assumption comparison"
                  >
                    <thead>
                      <tr>
                        <th>Arrival assumption</th>
                        <th>Pairs with projected lost units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(queue.run.supply_projection_counts).map(
                        ([name, count]) => (
                          <tr key={name}>
                            <td>{humanize(name)}</td>
                            <td>{formatNumber(count)}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                <p className={styles.note}>
                  Firm committed supply is distinct from assumed future
                  replenishment. These are projected shortages, not observed
                  stockouts or acceptance-test outcomes.
                </p>
              </section>
            )}
            <section className={styles.section}>
              <h2>Reproducibility</h2>
              <dl className={styles.lineage}>
                {Object.entries({
                  "Signal set": queue.run.signal_set_id,
                  "Cutoff (UTC)": queue.run.signal_as_of,
                  "Canonical dataset": queue.run.canonical_dataset_id,
                  "Source release set": queue.run.source_release_set_id,
                  "Source releases": queue.run.source_release_ids.join("\n"),
                  "Metric contract": queue.run.metric_contract_version,
                  Publication: queue.run.signal_publication_version,
                  Ranker: queue.run.ranker_version,
                  "Configuration hash": queue.run.configuration_hash,
                }).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <p className={styles.notice} role="note">
              {calibrationNotice(queue.run.calibration_status) ??
                "Synthetic engineering release. Commercial and operational calibration has not been verified."}{" "}
              Only the current release is served; historical report archives and
              weekly POS reports are not yet available.
            </p>
          </article>
        );
      }}
    </ReleaseGate>
  );
}
