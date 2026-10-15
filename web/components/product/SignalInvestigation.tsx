"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { SignalDetail, SignalQueue } from "@/lib/signal/schema";
import { fetchInvestigation, type Day, type Investigation } from "@/lib/investigation/schema";
import { decisionSummary, formatNumber, formatScore, humanize } from "@/lib/signal/presentation";
import { useRelease } from "./ReleaseProvider";
import InvestigationChart, { type ChartPoint } from "./InvestigationChart";
import styles from "./Investigation.module.css";

const number=(n:number|null|undefined)=>n==null?"—":formatNumber(n);
const precise=(n:number|null|undefined)=>n==null?"—":new Intl.NumberFormat("en-US",{maximumFractionDigits:6}).format(n);
const headlines={risk:"Will supply arrive before stock runs out?",acceleration:"Recent demand is persistently above the forecast-relative baseline.",deceleration:"The forecast remains above recent forecast-relative demand.",excess:"Inventory remains above the policy target through the horizon."};

export default function SignalInvestigation({detail,queue,onSelect,fallback}: {detail:SignalDetail;queue:SignalQueue;onSelect:(id:string)=>void;fallback:ReactNode}){
  const [data,setData]=useState<Investigation|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [attempt,setAttempt]=useState(0);
  const pending=useRef<{key:string;controller:AbortController;promise:Promise<Investigation>}|null>(null);
  const generation=useRef(0);
  const {retry:reloadRelease}=useRelease();
  useEffect(()=>{
    const key=`${detail.signal.signal_id}:${queue.run.signal_set_id}:${attempt}`;
    if(pending.current?.key!==key){
      pending.current?.controller.abort();
      const controller=new AbortController();
      pending.current={key,controller,promise:fetchInvestigation(detail.signal.signal_id,queue.run.signal_set_id,controller.signal)};
    }
    const request=pending.current;
    const lifecycle=generation;
    const token=++lifecycle.current;
    let active=true;
    request.promise.then(value=>{
      if(!active||request.controller.signal.aborted)return;
      if(value.signal_id!==detail.signal.signal_id || value.signal_set_id!==queue.run.signal_set_id || value.configuration_hash!==queue.run.configuration_hash || value.canonical_dataset_id!==queue.run.canonical_dataset_id || Date.parse(value.signal_as_of)!==Date.parse(queue.run.signal_as_of) || value.observation_date!==detail.signal.observation_date || value.signal_type!==detail.signal.signal_type || value.direction!==detail.signal.signal_direction) throw new Error("investigation_unavailable");
      setData(value);
    }).catch(e=>{if(active&&!request.controller.signal.aborted)setError(e instanceof Error&&e.message==="release_changed"?"release_changed":"investigation_unavailable");});
    // Strict Mode replays setup/cleanup synchronously. Share the request while still
    // cancelling on a real unmount, selection change, or retry.
    return ()=>{active=false;queueMicrotask(()=>{if(lifecycle.current===token)request.controller.abort();});};
  },[detail.signal,queue.run,attempt]);
  if(error==="release_changed")return <div role="alert" className={styles.alert}>The release changed. Reload Attention before continuing.<button className={styles.action} onClick={reloadRelease}>Reload Attention</button></div>;
  if(error)return <><div className={styles.alert} role="alert">Visual investigation is unavailable or failed validation. The validated published calculation evidence remains below. No chart has been invented. <button className={styles.action} onClick={()=>{setError(null);setAttempt(n=>n+1);}}>Retry investigation</button></div>{fallback}</>;
  if(!data)return <p role="status" className={styles.note}>Loading release-bound investigation…</p>;
  return <Workspace data={data} detail={detail} queue={queue} onSelect={onSelect} fallback={fallback}/>;
}

function Workspace({data,detail,queue,onSelect,fallback}: {data:Investigation;detail:SignalDetail;queue:SignalQueue;onSelect:(id:string)=>void;fallback:ReactNode}){
  const signal=detail.signal;
  const demand=signal.signal_type==="demand_momentum";
  const excess=signal.signal_type==="inventory_imbalance";
  const [depth,setDepth]=useState<1|2|3>(1);
  const [date,setDate]=useState<string|null>(null);
  const [week,setWeek]=useState<number|null>(null);
  const [mode,setMode]=useState<"demand"|"supply">("demand");
  const [path,setPath]=useState("base");
  const [units,setUnits]=useState(excess || demand || data.cover_status!=="available");
  const [expanded,setExpanded]=useState<string|null>(null);
  const [eventId,setEventId]=useState<string|null>(null);
  const [context,setContext]=useState<"urgency"|"confidence"|null>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const ledgerRef=useRef<HTMLElement|null>(null);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
  const steps=["Situation","Explanation","Numbers"];
  const series=mode==="supply"?path==="base"?"typical":path:path;
  const forecast=data.days.filter(d=>d.series===series && d.phase==="projected");
  const receiptKind=(d:Day):"observed"|"firm"|"assumed"|"mixed"=>{
    if(d.phase==="actual")return "observed";
    const assumption=mode==="supply"&&path!=="committed"?path:"typical";
    const events=data.receipts.filter(r=>(mode!=="supply"||path!=="committed"||r.state!=="planned")&&r[assumption as "early"|"typical"|"conservative"]===d.date);
    const firm=events.some(r=>r.state!=="planned"),planned=events.some(r=>r.state==="planned");
    return firm&&planned?"mixed":planned?"assumed":"firm";
  };
  const historical=data.days.filter(d=>d.series==="history");
  const ledger=data.weeks.filter(w=>w.series==="history" || w.series===series).sort((a,b)=>a.start.localeCompare(b.start));
  const select=(p:ChartPoint)=>{
    setDate(p.date);
    setWeek(data.days.find(d=>d.date===p.date)?.week??data.weeks.find(w=>w.key===p.key)?.week??null);
    setDepth(previous=>previous===3?3:2);
  };
  const points:ChartPoint[]=demand?ledger.map(w=>({key:w.key,date:w.start,primary:w.phase==="actual"?w.sales:w.adjusted,secondary:w.phase==="actual"?(w.partial?null:w.retailer_forecast):w.baseline,bar:w.phase==="actual"?w.sales:null,recent:w.role==="recent",shade:w.gap==null?null:Math.abs(w.gap),projected:w.phase==="projected",note:`${w.role} · retail week ${w.week}${w.partial?` · ${w.days}/7 days`:""}`})):[...historical,...forecast].map(d=>({key:`${d.series}:${d.date}`,date:d.date,primary:units?d.stock:d.cover,secondary:excess?d.target:null,shade:excess?d.excess:null,loss:excess?null:d.lost,receipt:d.receipts,receiptKind:receiptKind(d),projected:d.phase==="projected",note:d.receipts?`Receipt ${number(d.receipts)} units · ${receiptKind(d)}`:d.flags.join(", ")}));
  const selected=points.find(p=>demand?data.weeks.find(w=>w.key===p.key)?.week===week && p.projected===(date!=null && date>data.observation_date):p.date===date)?.key??null;
  const selectedDay=forecast.find(d=>d.date===date)??historical.find(d=>d.date===date);
  const selectedWeek=ledger.find(w=>w.week===week && (date? w.phase===(date>data.observation_date?"projected":"actual"):true));
  const changeMode=(next:"demand"|"supply")=>{setMode(next);setPath(next==="supply"?"typical":"base");};
  const go=(next:1|2|3)=>{setDepth(next);heading.current?.focus();if(next===3)requestAnimationFrame(()=>ledgerRef.current?.scrollIntoView?.({block:"start"}));};
  const event=data.receipts.find(r=>r.event_id===eventId);
  const actionHorizon=Math.max(28,signal.days_until_material_impact,...(detail.supply_context?.actions.map(a=>a.conservative_days)??[]));
  const cumulative=data.days.filter(d=>d.series==="base" && d.phase==="projected").map(d=>({key:`gap:${d.date}`,date:d.date,primary:d.cumulative_gap,projected:true}));
  return <div className={styles.workspace}>
    <aside className={styles.rail} aria-label="Investigation queue">{queue.signals.map(row=><button key={row.signal_id} aria-pressed={row.signal_id===signal.signal_id} onClick={()=>onSelect(row.signal_id)}>#{row.overall_rank_position} {row.identity.item_name}<br/><span>{row.identity.source_location_id}</span></button>)}</aside>
    <div className={styles.body}>
      <nav className={styles.steps} aria-label="Investigation layers">{steps.map((label,i)=><button key={label} aria-current={depth===i+1?"step":undefined} disabled={i>0 && week===null} onClick={()=>go((i+1) as 1|2|3)}>{i+1}. {label}</button>)}{depth>1&&<button onClick={()=>go((depth-1) as 1|2)}>← Back one layer</button>}</nav>
      <h3 ref={heading} tabIndex={-1} className={styles.headline}>{depth===1?headlines[signal.signal_direction]:depth===2?"What explains this point?":"Inspect the weekly and daily evidence"}</h3>
      <p className={styles.note}>Snapshot {data.observation_date} · historical observations and 28-day projections are separate. Lead times and replenishment remain synthetic assumptions.</p>
      <div className={styles.controls}><button onClick={()=>{setContext("urgency");}}>Urgency {signal.urgency_score==null?"unavailable":formatScore(signal.urgency_score)}</button><button onClick={()=>setContext("confidence")}>Confidence {formatScore(signal.confidence_score)}</button>{!demand&&<><button aria-pressed={units} onClick={()=>setUnits(true)}>Units</button><button aria-pressed={!units} disabled={data.cover_status!=="available" || excess} onClick={()=>setUnits(false)}>Weeks of supply</button></>}</div>
      {context==="confidence"&&<div className={styles.timeline}><strong>Evidence confidence, not probability</strong><div className={styles.cards}><Fact label="Forecast quality" value={formatScore(signal.forecast_quality)}/><Fact label="Completeness" value={formatScore(signal.data_completeness)}/><Fact label="Stability" value={formatScore(signal.stability_score)}/></div><p>{signal.ranker_version==="memento-signal-urgency-ranker-v2"?"Confidence is the product of these three published inputs.":"Confidence uses the scoring policy declared by this release."}</p><button className={styles.action} onClick={()=>setContext(null)}>Close score context</button></div>}
      {context==="urgency"&&<div className={styles.timeline}><strong>{decisionSummary(signal)}</strong><p>{demand?"Material impact is the half-gap milestone, not a stockout date.":"This is the published material-impact timing."} Urgency does not confirm stock, capacity, or authority. Bars show conservative completion from the snapshot; the blue marker is material impact at {signal.days_until_material_impact} days, on a {actionHorizon}-day scale.</p>{detail.supply_context?.actions.map(a=><div key={a.action}><span>{humanize(a.action)} · {a.early_days}/{a.typical_days}/{a.conservative_days} calendar days · {a.feasibility}</span><div className={styles.timelineBar}><span style={{width:`${Math.min(100,a.conservative_days/actionHorizon*100)}%`}}/><i className={styles.impactMarker} style={{left:`${signal.days_until_material_impact/actionHorizon*100}%`}}/></div><p>Typical slack {a.typical_slack}; conservative slack {a.conservative_slack} days.</p><p>{a.stages.map(humanize).join(" → ")}. Missing: {a.missing_prerequisites.map(humanize).join(", ")||"none"}.</p></div>)}{!detail.supply_context?.actions.length&&<p>Declared review/replan allowance; no supported supply intervention for this direction.</p>}<button className={styles.action} onClick={()=>setContext(null)}>Close score context</button></div>}
      {!demand&&depth>=2&&<><div className={styles.controls} aria-label="Comparison axis"><button aria-pressed={mode==="demand"} onClick={()=>changeMode("demand")}>Demand sensitivity</button><button aria-pressed={mode==="supply"} disabled={excess || !data.days.some(d=>d.series==="typical")} onClick={()=>changeMode("supply")}>Supply timing</button></div><div className={styles.controls} aria-label="Published paths">{(mode==="demand"?["low","base","high"]:["committed","early","typical","conservative"]).map(p=><button key={p} aria-pressed={path===p} onClick={()=>setPath(p)}>{humanize(p)}</button>)}</div><p className={styles.note}>{mode==="demand"?"Fixed demand paths under the published supply assumption; not confidence intervals.":"Supply arrival sensitivities with base demand held fixed; not a nine-combination scenario engine."}{!units&&" Weeks at snapshot projected average demand; one fixed denominator, including normalized historical stock."}{data.cover_status==="zero_reference_demand"&&" Zero reference demand: stock cover is unavailable; inspect units."}</p></>}
      {!demand&&depth===1&&<p className={styles.note}>{units?"Inventory is shown in units; receipt markers are dated expected supply.":`Equivalent weeks at snapshot projected average demand (${number(data.reference_weekly_demand)} units/week). Historical stock uses the same reference.`}</p>}
      <InvestigationChart title={demand?"Demand divergence":excess?"Inventory versus target":"Inventory runway"} points={points} unit={units?"units":"equivalent weeks"} primaryLabel={demand?"Observed sales / momentum-adjusted demand":"Stock"} secondaryLabel={demand?"Retailer history / published baseline forward":excess?"Policy target":undefined} selected={selected} onSelect={select} materialDate={data.diagnostics.material_date}/>
      {!demand&&!excess&&<p className={styles.note}>Solid receipt markers = observed/firm; hollow = assumed; dotted = mixed. Firm supply is still an expected arrival, not a guarantee. The orange strip marks projected unfulfilled demand; inventory never goes below zero.</p>}
      {depth>=2&&<section aria-label="Signal explanation">
        <p className={styles.note}>Pinned {date} · retail week {week}. Selecting another point updates this explanation and the ledger.</p>
        {demand?<><div className={styles.cards}><Fact label="Baseline sales / retailer forecast" value={number(data.diagnostics.baseline_ratio)}/><Fact label="Recent sales / retailer forecast" value={number(data.diagnostics.recent_ratio)}/><Fact label="Applied momentum multiplier" value={number(data.diagnostics.multiplier)}/><Fact label="Historical error allowance · units" value={number(data.diagnostics.error_allowance)}/></div><p className={styles.note}>Six qualifying baseline weeks, then two qualifying recent weeks. Multiplier clamp 0.50–1.50; raw multiplier {number(data.diagnostics.raw_multiplier)}. The error allowance is an admission comparator, not a statistical confidence band.</p><div className={styles.tableWrap}><table className={styles.table} aria-label="Demand persistence"><thead><tr><th>Qualifying week</th><th>Role</th><th>Actual / retailer forecast</th></tr></thead><tbody>{data.weeks.filter(w=>w.phase==="actual"&&w.role!=="excluded").map(w=><tr key={w.key} data-selected={w.week===week}><td>{w.week}</td><td>{w.role}</td><td>{number(w.ratio)}</td></tr>)}</tbody></table></div><InvestigationChart title="Cumulative forecast gap" points={cumulative} unit="units" primaryLabel="Absolute gap accumulated" selected={date?`gap:${date}`:null} onSelect={select} materialDate={data.diagnostics.material_date}/><p className={styles.note}>The material-impact date marks half the total forward gap, not physical depletion or guaranteed opportunity capture.</p></>:excess?<><div className={styles.cards}><Fact label="Projected stock · units" value={number(selectedDay?.stock)}/><Fact label="Within target · units" value={number(selectedDay?.within_target)}/><Fact label="Excess · units" value={number(selectedDay?.excess)}/><Fact label="Target cover · days" value={number(data.diagnostics.target_cover_days)}/></div>{selectedDay?.stock!=null&&selectedDay.stock>0&&selectedDay.within_target!=null&&<div className={styles.stack} aria-label="Stock split into within target and excess"><span style={{width:`${selectedDay.within_target/selectedDay.stock*100}%`}}/><span className={styles.excess} style={{flex:1}}/></div>}<p className={styles.note}>Target cover = declared allowance {signal.minimum_reaction_days} + safety {number(data.diagnostics.safety_days)} days. This modeled balance is not proof of overordering. Headline capital/carrying exposure remains the published horizon-end measure.</p></>:<><div className={styles.cards}>{(["opening","receipts","demand","fulfilled","lost","stock"] as const).map(field=><Fact key={field} label={`${field==="stock"?"Closing stock":humanize(field)} · units`} value={number(selectedDay?.[field])}/>)}</div><InvestigationChart title="Demand and receipts" points={forecast.map(d=>({key:`supply:${d.date}`,date:d.date,primary:d.demand,secondary:d.receipts,bar:d.receipts,shade:d.lost,projected:true,note:d.lost?`${number(d.lost)} unfulfilled units`:""}))} unit="units" primaryLabel="Demand" secondaryLabel="Receipts" selected={date?`supply:${date}`:null} onSelect={select}/></>}
        {selectedWeek?.flags.length? <p className={styles.note}>Evidence notes: {selectedWeek.flags.map(humanize).join(" · ")}. Excluded weeks are not ordinary unconstrained demand observations.</p>:null}
        {data.receipts.length>0&&<><h4>Receipt events · select to inspect</h4><div className={styles.controls}>{data.receipts.map(r=><button key={r.event_id} aria-pressed={r.event_id===eventId} onClick={()=>{setEventId(r.event_id);if(r.typical){setDate(r.typical);setWeek(data.days.find(d=>d.date===r.typical)?.week??null);}}}>{r.typical??"Overdue / undated"} · {r.quantity} units · {humanize(r.state)}</button>)}</div>{event&&<div className={styles.timeline}><strong>{event.state==="planned"?"Assumed replenishment, not a purchase order":"Firm order portion"}</strong><p>{event.quantity} units · {event.early??"overdue"} / {event.typical??"overdue"} / {event.conservative??"overdue"} (early / typical / conservative).</p><p>{humanize(event.basis)} · {event.order_reference?`${event.order_reference}, line ${event.line}, version ${event.version}`:`Reference ${humanize(event.reference_status)}`}.</p></div>}</>}
        {depth===2&&<button className={styles.action} onClick={()=>go(3)}>Show numbers →</button>}
      </section>}
      {depth===3&&<section ref={ledgerRef} className={styles.ledger} aria-label="Weekly and daily ledger"><h4>Weekly ledger</h4><p className={styles.note}>Inventory columns are opening/closing balances, never summed daily stock. Flow columns sum covered days. Actual and projected portions remain separate. Retailer forecast is a full-week quantity; partial-week rows must not be compared as complete weeks.</p><div className={styles.tableWrap}><table className={styles.table} aria-label="Weekly investigation ledger"><thead><tr>{["Week / phase","Coverage / role","Sales","Opening stock","Receipts","Demand","Fulfilled","Unfulfilled","Closing stock","Retailer forecast (full week)","Vintage","Published baseline","Adjusted","Gap","Target","Excess"].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{ledger.map(w=><Fragment key={w.key}><tr data-selected={week===w.week && (date? w.phase===(date>data.observation_date?"projected":"actual"):true)}><td><button aria-expanded={expanded===w.key} aria-label={`Expand week ${w.week} ${w.phase}`} onClick={()=>{setExpanded(expanded===w.key?null:w.key);setWeek(w.week);setDate(w.start);}}>{w.week} · {w.phase} {expanded===w.key?"−":"+"}</button></td><td>{w.days}/7 days · {w.role}{w.flags.length?" · flagged":""}</td>{(["sales","opening","receipts","demand","fulfilled","lost","stock","retailer_forecast","forecast_vintage","baseline","adjusted","gap","target","excess"] as const).map(field=><td key={field}>{precise(w[field])}</td>)}</tr>{expanded===w.key&&<tr><td colSpan={16} className={styles.daily}><DailyLedger days={data.days.filter(d=>d.series===w.series&&d.week===w.week)} selected={date} onSelect={d=>{setDate(d.date);setWeek(d.week);}}/></td></tr>}</Fragment>)}</tbody></table></div><details className={styles.disclosure}><summary>Published calculation evidence and source lineage</summary>{fallback}<dl><dt>Investigation contract</dt><dd>{data.contract_version}</dd><dt>Stock-cover contract</dt><dd>{data.cover_version}</dd><dt>Parent manifest SHA-256</dt><dd>{data.signal_manifest_sha256}</dd><dt>Canonical manifest SHA-256</dt><dd>{data.canonical_manifest_sha256}</dd></dl></details></section>}
    </div>
  </div>;
}

function Fact({label,value}:{label:string;value:string}){return <div className={styles.fact}>{label}<strong>{value}</strong></div>;}
function DailyLedger({days,selected,onSelect}:{days:Day[];selected:string|null;onSelect:(day:Day)=>void}){
  const fields=["sales","opening","receipts","demand","fulfilled","lost","stock","baseline","adjusted","gap","target","excess"] as const;
  return <table className={styles.table} aria-label="Daily investigation ledger"><thead><tr><th>Date</th>{fields.map(f=><th key={f}>{humanize(f)}</th>)}<th>Evidence notes</th></tr></thead><tbody>{days.map(d=><tr key={`${d.series}:${d.date}`} data-selected={d.date===selected}><td><button onClick={()=>onSelect(d)}>Select {d.date}</button></td>{fields.map(f=><td key={f}>{precise(d[f])}</td>)}<td>{d.flags.map(humanize).join(" · ")||"—"}</td></tr>)}</tbody></table>;
}
