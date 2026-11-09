"use client";

import { useEffect, useState } from "react";
import { fetchReport, fetchSignalDetail, fetchSignalQueue } from "@/lib/signal/client";
import { calibrationNotice, type MondayReport, type SignalDetail, type SignalQueue, type SignalRow, type SignalType } from "@/lib/signal/schema";
import { dateLabel, impact, labelFor, labels, money, number } from "@/lib/signal/presentation";
import EvidenceChart from "./EvidenceChart";
import styles from "./Signal.module.css";
import { publicationStorageKey, workspacePath } from "@/lib/workspace-path";

export default function SignalView() {
  const [report, setReport] = useState<MondayReport | null>(null);
  const [queue, setQueue] = useState<SignalQueue | null>(null);
  const [filter, setFilter] = useState<SignalType>();
  const [inQueue, setInQueue] = useState(false);
  const [selected, setSelected] = useState<SignalRow | null>(null);
  const [detail, setDetail] = useState<SignalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [queueRequest, setQueueRequest] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const pinned = sessionStorage.getItem(publicationStorageKey()) ?? undefined;
    fetchReport(pinned, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      if (pinned && value.run.signal_set_id !== pinned) throw new Error("Report publication mismatch");
      sessionStorage.setItem(publicationStorageKey(), value.run.signal_set_id);
      setReport(value);
    }).catch(() => { if (!controller.signal.aborted) setError("The pinned publication is unavailable or failed validation. Retry, or explicitly open the latest publication."); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!report || !inQueue) return;
    const controller = new AbortController();
    fetchSignalQueue(filter, controller.signal, report.run.signal_set_id).then((value) => {
      if (controller.signal.aborted) return;
      if (value.run.signal_set_id !== report.run.signal_set_id || value.signals.some((row) => filter && (row.signal_type !== filter || filter === "demand_momentum" && row.signal_direction !== "acceleration"))) throw new Error("Queue publication or selection mismatch");
      setQueue(value);
      setSelected(value.signals[0] ?? null);
    }).catch(() => { if (!controller.signal.aborted) setError("The attention queue could not be validated for this publication."); });
    return () => controller.abort();
  }, [report, inQueue, filter, retry, queueRequest]);
  useEffect(() => {
    if (!selected || !report || !inQueue) return;
    const controller = new AbortController();
    fetchSignalDetail(selected.signal_id, controller.signal, report.run.signal_set_id).then((value) => {
      if (controller.signal.aborted) return;
      if (value.signal.signal_id !== selected.signal_id || value.signal.configuration_hash !== report.run.configuration_hash || value.signal.canonical_dataset_id !== report.run.canonical_dataset_id || value.signal.source_release_set_id !== report.run.source_release_set_id || value.signal.overall_rank_position !== selected.overall_rank_position) throw new Error("Detail publication mismatch");
      setDetail(value);
    }).catch(() => { if (!controller.signal.aborted) setError("The selected evidence could not be validated. No previous evidence is shown."); });
    return () => controller.abort();
  }, [selected, report, inQueue, retry]);
  function openQueue(type?: SignalType) {
    setFilter(type); setQueue(null); setSelected(null); setDetail(null); setInQueue(true); setQueueRequest((value) => value + 1);
  }
  if (error) return <section className={styles.state} role="alert"><h1>Demo publication unavailable</h1><p>{error}</p><button onClick={() => { setError(null); setQueue(null); setSelected(null); setDetail(null); setRetry(retry + 1); }}>Retry pinned publication</button><button onClick={() => { sessionStorage.removeItem(publicationStorageKey()); setError(null); setReport(null); setInQueue(false); setQueue(null); setSelected(null); setDetail(null); setRetry(retry + 1); }}>Open latest publication</button></section>;
  if (!report) return <section className={styles.state} role="status">Loading Monday report…</section>;
  return <div className={styles.page}>
    <form action={workspacePath("/")} method="get" onSubmit={() => sessionStorage.removeItem(publicationStorageKey())}><button type="submit" className={styles.linkButton}>← Restart demo</button></form>
    <header className={styles.header}><div><p className={styles.eyebrow}>{report.scope.classification === "synthetic" ? "Miro Toys / Miro Spark · Walmart US" : "Memento Loop · Customer workspace"}</p><h1>{inQueue ? "Attention queue" : "Monday report"}</h1><p>{inQueue ? "Published priorities, with the evidence behind each finding." : "Three places to focus your inventory review."}</p></div><span className={styles.badge}>{report.scope.classification === "synthetic" ? "Synthetic demo" : "Confidential"} · read only</span></header>
    <section className={styles.context} aria-label="Report scope"><p><strong>As of {dateLabel(report.run.signal_as_of)}</strong> · {new Date(report.run.signal_as_of).toLocaleTimeString("en-US", { timeZone: "UTC", timeZoneName: "short" })}</p><p>{report.scope.item_count} items · {report.scope.store_count.toLocaleString()} {report.scope.store_count === 1 ? "store" : "stores"} · observed {dateLabel(report.scope.observed_from)} – {dateLabel(report.scope.observed_through)}</p><p>Projection: {dateLabel(report.scope.horizon_from)} – {dateLabel(report.scope.horizon_through)} · Monday review cadence; frozen source cutoff</p></section>
    {calibrationNotice(report.run.calibration_status) && <p className={styles.notice}>{calibrationNotice(report.run.calibration_status)}</p>}
    {!inQueue ? <>
      <div className={styles.cards}>{report.categories.map((card) => <section key={card.signal_type} className={styles.summary}>
        <p className={styles.eyebrow}>{labels[card.signal_type]}</p><h2>{card.candidate_count.toLocaleString()} <span>store-item {card.candidate_count === 1 ? "signal" : "signals"}</span></h2>
        {card.leading_signal ? <><p className={styles.leader}>Leading case · overall #{card.leading_signal.overall_rank_position}</p><h3>{card.leading_signal.identity.item_name}</h3><p>{card.leading_signal.identity.store_name}</p><p className={styles.amount}>{impact(card.leading_signal)}</p></> : <p>No eligible signals in this publication.</p>}
        <button onClick={() => openQueue(card.signal_type)}>Review {labels[card.signal_type].toLowerCase()} →</button>
      </section>)}</div>
      <button className={styles.linkButton} onClick={() => openQueue()}>Open overall top ten →</button>
      <p className={styles.notice}>Counts cover the complete eligible selection. Amounts describe the leading case, not portfolio totals. Revenue exposure, contribution opportunity, and inventory capital are separate measures.</p>
    </> : <>
      <button className={styles.linkButton} onClick={() => { setInQueue(false); setQueue(null); setSelected(null); setDetail(null); }}>← Back to Monday report</button>
      <nav className={styles.filters} aria-label="Signal category"><button aria-pressed={!filter} onClick={() => openQueue()}>All · overall top ten</button>{report.categories.map((card) => <button key={card.signal_type} aria-pressed={filter === card.signal_type} onClick={() => openQueue(card.signal_type)}>{labels[card.signal_type]} · {card.candidate_count.toLocaleString()}</button>)}</nav>
      <p className={styles.notice}>{filter ? "Up to ten matching signals from the full publication." : "Natural overall top ten across all signal types, including demand deceleration."} Overall ranks stay unchanged. Categories may include cases outside the overall top ten.</p>
      {!queue ? <p role="status">Loading attention queue…</p> : queue.signals.length === 0 ? <section className={styles.state} role="status">No eligible signals in this selection.</section> : <div className={styles.workspace}><section className={styles.list} aria-label="Ranked signals">{queue.signals.map((row) => <button key={row.signal_id} aria-pressed={selected?.signal_id === row.signal_id} onClick={() => { if (row.signal_id !== selected?.signal_id) { setSelected(row); setDetail(null); } }}><span className={styles.eyebrow}>Overall #{row.overall_rank_position} · {labelFor(row)}</span><strong>{row.identity.item_name}</strong><span>{row.identity.store_name}</span><span>{impact(row)}</span><small>Material impact in {row.days_until_material_impact} days · confidence {number(row.confidence_score)} / 1</small></button>)}</section><aside>{selected && (detail ? <SignalCard detail={detail} /> : <p role="status">Validating selected evidence…</p>)}</aside></div>}
    </>}
    <details className={styles.technical}><summary>Publication and calculation lineage</summary><dl><dt>Signal publication</dt><dd>{report.run.signal_set_id}</dd><dt>Source release</dt><dd>{report.run.source_release_set_id}</dd><dt>Canonical dataset</dt><dd>{report.run.canonical_dataset_id}</dd><dt>Metric contract</dt><dd>{report.run.metric_contract_version}</dd><dt>Ranker</dt><dd>{report.run.ranker_version}</dd></dl></details>
  </div>;
}

function SignalCard({ detail }: { detail: SignalDetail }) {
  const row = detail.signal;
  return <article className={styles.detail}><p className={styles.eyebrow}>Overall #{row.overall_rank_position} · {labelFor(row)}</p><h2>{row.identity.item_name}</h2><p>{row.identity.store_name}</p><p>{row.signal_type === "availability" ? "Projected end-of-day book inventory depletes within the next 28 days." : row.signal_type === "inventory_imbalance" ? "Projected inventory remains above the published target at the end of the horizon." : row.signal_direction === "acceleration" ? "Both recent weeks outperform the historical forecast baseline beyond the error-band rule." : "Both recent weeks underperform the historical forecast baseline beyond the error-band rule."}</p>
    <div className={styles.facts}>{row.signal_type === "inventory_imbalance" ? <><Fact label="Projected excess units" value={number(row.headline_metric_value)} /><Fact label="Inventory capital exposed" value={money(row.inventory_cost_exposed_amount)} /><Fact label="28-day carrying cost" value={money(row.carrying_cost_28d_amount)} /></> : <><Fact label={row.signal_type === "availability" ? "Estimated retail sales exposure" : "Forward retail opportunity / exposure"} value={money(row.estimated_retail_sales_impact_amount)} />{row.signal_type === "demand_momentum" && <><Fact label="Forward demand gap · units" value={number(row.headline_metric_value)} /><Fact label="Contribution opportunity / exposure" value={money(row.estimated_contribution_impact_amount)} /></>}</>}
      {row.signal_type === "availability" && <Fact label="Projected depletion date" value={detail.projected_depletion_date ? dateLabel(detail.projected_depletion_date) : "Not available"} />}<Fact label="Material impact in" value={`${row.days_until_material_impact} days`} /><Fact label="Published confidence" value={`${number(row.confidence_score)} / 1`} /></div>
    <p className={styles.notice}>Confidence is an evidence-quality score, not a probability. Economic amounts are estimates, not realized losses or guaranteed savings.</p>
    {detail.supply_context && <p className={styles.notice}>This result uses illustrative planned replenishment and assumed lead times. Stock, capacity, and authority are unconfirmed. Assumption version: {detail.supply_context.assumption_version}.</p>}
    <EvidenceChart detail={detail} />
    <details className={styles.technical}><summary>Confidence, sensitivity, and calculation evidence</summary><div className={styles.facts}><Fact label="Forecast quality" value={number(row.forecast_quality)} /><Fact label="Data completeness" value={number(row.data_completeness)} /><Fact label="Stability" value={number(row.stability_score)} /><Fact label="Impact score" value={number(row.impact_score)} /><Fact label="Reaction score" value={number(row.reaction_score)} /><Fact label="Published rank score" value={number(row.rank_score)} /></div><p>Economic basis: {row.economic_impact_basis.replaceAll("_", " ")}</p><p>{detail.evidence.length} published rows · configuration {row.configuration_hash}</p>{detail.supply_context && <p>Supply basis: {detail.supply_context.classification} · {detail.supply_context.calibration} · {detail.supply_context.ranking_policy}</p>}<div className={styles.tableScroll}><table><caption>Published evidence values · units</caption><thead><tr><th>Date</th><th>Path / kind</th><th>Actual</th><th>Forecast</th><th>Adjusted</th><th>Ending inventory</th><th>Inbound</th><th>Target</th></tr></thead><tbody>{detail.evidence.map((e, index) => <tr key={index}><td>{e.evidence_date}</td><td>{e.path ?? e.evidence_type}</td><td>{number(e.actual_units)}</td><td>{number(e.retailer_forecast_units)}</td><td>{number(e.adjusted_forecast_units)}</td><td>{number(e.ending_units)}</td><td>{number(e.scheduled_inbound_units)}</td><td>{number(e.target_units)}</td></tr>)}</tbody></table></div></details>
  </article>;
}
function Fact({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
