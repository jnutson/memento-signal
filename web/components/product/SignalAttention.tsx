"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSignalDetail } from "@/lib/signal/client";
import type { SignalDetail, SignalQueue, SignalType } from "@/lib/signal/schema";
import { decisionSummary, impactSummary, formatCutoff, formatMoney, formatNumber, formatScore, humanize, signalLabels, signalTypes } from "@/lib/signal/presentation";
import { SupplyEvidence } from "./SupplyEvidence";
import { ReleaseGate } from "./ReleaseProvider";
import Number from "./NumberFact";
import SignalScene from "./SignalScene";
import SignalInvestigation from "./SignalInvestigation";
import styles from "./Product.module.css";
import original from "./OriginalAttention.module.css";
import adaptation from "./Adaptation.module.css";

export default function SignalAttention({ initialId = null }: { initialId?: string | null }) {
  return <ReleaseGate>{(queue) => <Queue key={`${queue.run.signal_set_id}-${initialId}`} queue={queue} initialId={initialId} />}</ReleaseGate>;
}

function Queue({ queue, initialId }: { queue: SignalQueue; initialId: string | null }) {
  const [filter, setFilter] = useState<SignalType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => queue.signals.some((signal) => signal.signal_id === initialId) ? initialId : null);
  const [detail, setDetail] = useState<SignalDetail | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deep, setDeep] = useState(initialId !== null);
  const [listPage, setListPage] = useState(0);
  const [view, setView] = useState<"graph" | "feed">("graph");
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const graphFocus = useRef<HTMLButtonElement | null>(null);
  const feedFocus = useRef<HTMLButtonElement | null>(null);
  const pane = useRef<HTMLElement | null>(null);
  useEffect(() => { pane.current?.scrollTo?.(0, 0); }, [selectedId]);
  const backToQueue = () => {
    setDeep(false);
    requestAnimationFrame(() => (returnFocus.current?.offsetParent ? returnFocus.current : view === "feed" ? feedFocus.current : graphFocus.current)?.focus());
  };
  const selected = queue.signals.find((signal) => signal.signal_id === selectedId) ?? null;
  const displayed = useMemo(() => filter ? queue.signals.filter((signal) => signal.signal_type === filter) : queue.signals, [filter, queue.signals]);
  const select = useCallback((id: string | null) => {
    if (id !== selectedId) { setSelectedId(id); setDetail(null); setDetailError(false); }
    if (!id) setDeep(false);
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetchSignalDetail(selectedId, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      const provenance = ["configuration_hash", "canonical_dataset_id", "source_release_set_id", "metric_contract_version", "signal_publication_version", "ranker_version"] as const;
      const sameCutoff = Date.parse(value.signal.signal_as_of) === Date.parse(queue.run.signal_as_of);
      if (value.signal.signal_id !== selectedId || !sameCutoff || provenance.some((field) => value.signal[field] !== queue.run[field])) throw new Error("Evidence release mismatch");
      setDetail(value);
    }).catch(() => { if (!controller.signal.aborted) setDetailError(true); });
    return () => controller.abort();
  }, [selectedId, queue.run, attempt]);
  const step = (direction: 1 | -1) => {
    const index = displayed.findIndex((row) => row.signal_id === selectedId);
    if (displayed.length) select(displayed[(index + direction + displayed.length) % displayed.length].signal_id);
  };
  const pager = selected && <div className={original.pager}><button className={original.pagerBtn} aria-label="Previous signal" onClick={() => step(-1)}>‹</button><span>{displayed.findIndex((row) => row.signal_id === selectedId) + 1} of {displayed.length}</span><button className={original.pagerBtn} aria-label="Next signal" onClick={() => step(1)}>›</button></div>;
  return <div className={adaptation.page}>
    <h1 className="sr-only">Attention</h1>
    <div className={original.fit} style={{ display: deep && selected ? "none" : undefined }}>
      <div className={original.stats} aria-label="Signal run summary"><Stat label="Displayed signals" value={String(queue.signals.length)} /><Stat label="Eligible signals" value={formatNumber(queue.run.candidate_count)} /><Stat label="Availability risks · full run" value={formatNumber(queue.run.candidate_counts_by_type.availability)} /></div>
      <div className={adaptation.viewToggle} aria-label="Attention view"><button ref={graphFocus} aria-pressed={view === "graph"} onClick={() => setView("graph")}>Graph</button><button ref={feedFocus} aria-pressed={view === "feed"} onClick={() => setView("feed")}>Feed</button><span>Overall top ten · published priority order</span></div>
      {view === "feed" && <section className={adaptation.feed} aria-label="Attention feed"><h2 className="sr-only">Ranked by priority</h2>{displayed.map((signal) => <article key={signal.signal_id} className={`${adaptation.feedCard} ${selectedId === signal.signal_id ? adaptation.feedSelected : ""}`}><div className={adaptation.feedHeading}><span className={adaptation.feedRank}>{signal.overall_rank_position}</span><h2>{signal.identity.item_name} <span>· {signalLabels[signal.signal_type]}</span></h2><span>{formatScore(signal.rank_score)} priority</span></div><p className={adaptation.readout}>{signal.identity.store_name} · {humanize(signal.signal_direction)}</p><p className={adaptation.impact}>{impactSummary(signal)}</p><p className={adaptation.readout}>{decisionSummary(signal)}</p><div className={adaptation.feedFooter}><span>Impact {formatScore(signal.impact_score)} · {signal.urgency_score == null ? `Baseline actionability ${formatScore(signal.reaction_score)}` : `Urgency ${formatScore(signal.urgency_score)}`} · Confidence {formatScore(signal.confidence_score)}</span><button className={original.btn} aria-label={`#${signal.overall_rank_position} · ${signalLabels[signal.signal_type]} · ${signal.identity.item_name} · ${signal.identity.store_name}`} onClick={(event) => { returnFocus.current=event.currentTarget; select(signal.signal_id); setDeep(true); }}>Inspect evidence →</button></div><p className={adaptation.readout}>Scores / 100. Confidence is evidence quality, not probability. Urgency does not confirm feasibility or authority.</p></article>)}{!displayed.length && <p className={adaptation.readout}>No displayed signals of this type in the overall top ten.</p>}</section>}
      <div className={original.layout} style={{ display: view === "feed" ? "none" : undefined }}>
        <SignalScene signals={displayed} selectedId={selectedId} hoveredId={hoveredId} onSelect={(id)=>{select(id);if(id)setDeep(true);}} onHover={setHoveredId} />
        <aside className={original.aside}>
          {selected && <article className={original.card}><div className={original.cardTop}><span>Miro Spark · {selected.identity.store_name}</span>{pager}</div><h2 className={original.headline}><strong>{selected.identity.item_name}</strong> · {signalLabels[selected.signal_type]}<br />Impact within <strong>{selected.days_until_material_impact} days</strong></h2><div className={original.section}><div className={original.facts}><div className={original.fact}><div className={original.factHead}><span className={original.factNum}>{formatNumber(selected.headline_metric_value)}</span><span className={original.factUnit}>units</span></div><span className={adaptation.readout}>{humanize(selected.headline_metric_name)}</span></div><div className={original.fact}><div className={original.factHead}><span className={original.factNum}>{formatScore(selected.rank_score)}</span><span className={original.factUnit}>priority</span></div><span className={adaptation.readout}>Published rank score / 100</span></div></div></div><p className={adaptation.impact}>{impactSummary(selected)}</p><p className={adaptation.readout}>{decisionSummary(selected)}</p><p className={adaptation.readout}>Impact {formatScore(selected.impact_score)} · {selected.urgency_score == null ? `Baseline actionability ${formatScore(selected.reaction_score)}` : `Urgency ${formatScore(selected.urgency_score)}`} · Confidence {formatScore(selected.confidence_score)} / 100</p><div className={original.actions}><button className={original.btnPrimary} onClick={() => setDeep(true)}>Inspect evidence</button><a href="/reports" className={original.btn}>Reports</a><button className={original.btnText} onClick={() => select(null)}>Close</button></div></article>}
          <section className={original.list} aria-labelledby="ranked-title"><div className={original.listHead}><h2 id="ranked-title" style={{ font: "inherit" }}>Ranked by priority</h2>{displayed.length > 6 && <button className={`${original.pagerBtn} ${adaptation.listPager}`} aria-label={listPage === 0 ? "Show signals 7 through 10" : "Show signals 1 through 6"} onClick={() => setListPage((page) => page === 0 ? 1 : 0)}>{listPage === 0 ? "›" : "‹"}</button>}</div><div className={`${original.listBody} ${adaptation.listBody}`}>{displayed.slice(listPage * 6, listPage * 6 + 6).map((signal) => <button key={signal.signal_id} className={`${original.row} ${selectedId === signal.signal_id ? original.rowSel : hoveredId === signal.signal_id ? original.rowHov : ""}`} aria-pressed={selectedId === signal.signal_id} aria-label={`#${signal.overall_rank_position} · ${signalLabels[signal.signal_type]} · ${signal.identity.item_name} · ${signal.identity.store_name}`} onClick={(event) => {returnFocus.current=event.currentTarget;select(signal.signal_id);setDeep(true);}} onPointerEnter={() => setHoveredId(signal.signal_id)} onPointerLeave={() => setHoveredId(null)}><span className={original.rank}>{signal.overall_rank_position}</span><span className={original.rowText}><span className={original.rowTitle}>{signal.identity.item_name}</span><span className={original.rowSub}>{humanize(signal.signal_direction)} · {signal.days_until_material_impact} days · {signal.identity.source_location_id}</span></span><span className={original.rowScore}>{formatScore(signal.rank_score)}</span></button>)}{!displayed.length && <p className={adaptation.readout}>{queue.signals.length ? "No signals of this type in the overall top ten. Eligible signals may still exist outside this published queue." : "No displayed signals in this validated release."}</p>}</div></section>
        </aside>
      </div>
          <details className={adaptation.disclosure}><summary>Filters and release context</summary><div className={adaptation.filters} aria-label="Signal type filter"><button aria-pressed={filter === null} onClick={() => { setFilter(null); setListPage(0); select(null); }}>All types</button>{signalTypes.map((type) => <button key={type} aria-pressed={filter === type} onClick={() => { setFilter(type); setListPage(0); select(null); }}>{signalLabels[type]}</button>)}</div><p>As of {formatCutoff(queue.run.signal_as_of)} UTC. Filters narrow the overall top ten, never rerank it. The green cube is the original visual guide, not an eligibility rule. Urgency means urgency to act, based on the conservative start-by deadline; it does not confirm execution feasibility. Confidence multiplies forecast quality, completeness, and stability in urgency-policy releases. Points can overlap when their scores are similar; use the list or pager to inspect each.</p><p>Synthetic engineering release. Supply lead times and planned replenishment are assumptions.</p></details>
    </div>
    {selected && <section ref={pane} id="signal-evidence" className={`${original.deep} ${adaptation.deep}`} aria-label="Selected signal evidence" style={{display:deep?undefined:"none"}}>
      <header className={adaptation.investigationHeader}>
      <div className={original.deepHead}><div><button className={original.back} onClick={backToQueue}>← Attention queue</button><h2 className={`${original.headline} ${original.h1}`}><strong>{selected.identity.item_name}</strong> · {signalLabels[selected.signal_type]}</h2><p className={adaptation.readout}>{selected.identity.store_name} · observed through {selected.observation_date} · cutoff {new Date(queue.run.signal_as_of).toISOString().slice(0,16).replace("T"," ")} UTC</p></div>{pager}<button className={original.btnText} onClick={() => {select(null);backToQueue();}}>Close evidence</button></div>
      <p className={adaptation.impact}>{impactSummary(selected)}</p><p className={adaptation.readout}>{decisionSummary(selected)}</p>
      <p className={adaptation.readout}>Confidence is an evidence-quality score, not a probability.</p>
      </header>
      {detailError ? <div role="alert"><p>Evidence could not be loaded or matched to this release.</p><button className={original.btn} onClick={() => { setDetailError(false); setAttempt((value) => value + 1); }}>Retry evidence</button></div> : detail ? <SignalInvestigation key={selected.signal_id} detail={detail} queue={queue} onSelect={select} fallback={<div className={styles.evidence}><Evidence detail={detail}/></div>}/> : <p role="status">Validating evidence…</p>}
    </section>}
  </div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className={original.stat}><span className={original.statLabel}>{label}</span><span className={original.statValue}>{value}</span></div>;
}

function Evidence({ detail }: { detail: SignalDetail }) {
  const signal = detail.signal;
  const demand = signal.signal_type === "demand_momentum";
  const fields = demand ? ["actual_units", "retailer_forecast_units", "adjusted_forecast_units"] as const : ["opening_units", "demand_units", "scheduled_inbound_units", "ending_units", "lost_units", "target_units"] as const;
  return <>
    <dl className={styles.facts}><Number label="Retail sales impact magnitude" value={formatMoney(signal.estimated_retail_sales_impact_amount)} /><Number label="Contribution impact magnitude" value={formatMoney(signal.estimated_contribution_impact_amount)} /><Number label="Inventory capital exposed" value={formatMoney(signal.inventory_cost_exposed_amount)} /><Number label="28-day carrying cost" value={formatMoney(signal.carrying_cost_28d_amount)} /><Number label="Forecast quality" value={formatScore(signal.forecast_quality)} /><Number label="Data completeness" value={formatScore(signal.data_completeness)} /></dl>
    <SupplyEvidence detail={detail} />
    <h3>{demand ? "Weekly and forward demand evidence" : "Daily inventory paths"}</h3><p>{detail.evidence.length} published rows · stability score {formatScore(signal.stability_score)}. Quantities are units. A dash means not applicable, not zero.</p>
    <div className={styles.tableWrap}><table className={styles.table} aria-label="Signal calculation evidence"><thead><tr><th>Date</th><th>Evidence / path</th>{fields.map((field) => <th key={field}>{humanize(field)}</th>)}</tr></thead><tbody>{detail.evidence.map((row, index) => <tr key={`${row.evidence_date}-${row.path}-${index}`}><td>{row.evidence_date}</td><td>{row.path ?? humanize(row.evidence_type)}</td>{fields.map((field) => <td key={field}>{row[field] === null ? "—" : formatNumber(row[field])}</td>)}</tr>)}</tbody></table></div>
    <h3>Published lineage</h3><dl className={styles.lineage}>{Object.entries({ "Signal ID": signal.signal_id, "Source release": signal.source_release_set_id, "Canonical dataset": signal.canonical_dataset_id, "Publication": signal.signal_publication_version, "Ranker": signal.ranker_version, "Configuration": signal.configuration_hash }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </>;
}
