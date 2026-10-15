import { z } from "zod";

const n = z.number().finite();
const units = n.nonnegative();
const optional = units.nullable();
const phase = z.enum(["actual", "projected"]);
const series = z.enum(["history", "low", "base", "high", "committed", "early", "typical", "conservative"]);
export const daySchema = z.strictObject({ date: z.iso.date(), week: z.number().int(), phase, series,
  opening: optional, stock: optional, sales: n.nullable(), receipts: optional, demand: optional, fulfilled: optional, lost: optional,
  baseline: optional, adjusted: optional, gap: n.nullable(), cumulative_gap: optional, target: optional, within_target: optional, excess: optional, cover: optional,
  flags: z.array(z.string()).max(8),
}).superRefine((d, ctx) => {
  if (d.phase === "projected" && d.demand != null && (d.opening == null || d.stock == null || d.receipts == null || d.fulfilled == null || d.lost == null || Math.abs(d.demand-d.fulfilled-d.lost) > .00001 || Math.abs(d.stock-d.opening-d.receipts+d.fulfilled) > .00001)) ctx.addIssue({code:"custom",message:"Projected balance mismatch"});
  if (d.baseline != null && (d.adjusted == null || d.gap == null || Math.abs(d.adjusted-d.baseline-d.gap) > .00001)) ctx.addIssue({code:"custom",message:"Gap mismatch"});
});
const weekSchema = z.strictObject({key:z.string(),week:z.number().int(),phase,series:z.string(),start:z.iso.date(),end:z.iso.date(),days:z.number().int().min(1).max(7),partial:z.boolean(),
  opening:optional,stock:optional,sales:n.nullable(),receipts:optional,demand:optional,fulfilled:optional,lost:optional,baseline:optional,adjusted:optional,gap:n.nullable(),target:optional,excess:optional,
  retailer_forecast:optional,forecast_vintage:z.number().int().nullable(),ratio:optional,role:z.enum(["baseline","recent","excluded","forward"]),flags:z.array(z.string()),
});
const receiptSchema = z.strictObject({event_id:z.string(),state:z.enum(["open","in_transit","planned"]),quantity:units,early:z.iso.date().nullable(),typical:z.iso.date().nullable(),conservative:z.iso.date().nullable(),basis:z.string(),order_reference:z.string().nullable(),line:z.number().int().nullable(),version:z.number().int().nullable(),known_at:z.iso.datetime({offset:true}).nullable(),reference_status:z.enum(["source_version","assumed_order","unavailable"])}).superRefine((r,ctx)=>{
  if (!(r.early===null && r.typical===null && r.conservative===null || r.early!==null && r.typical!==null && r.conservative!==null && r.early<=r.typical && r.typical<=r.conservative)) ctx.addIssue({code:"custom",message:"Receipt range mismatch"});
});
export const investigationSchema = z.strictObject({
  api_contract_version:z.literal("memento-signal-investigation-api-v1"),contract_version:z.literal("attention-investigation-v1"),cover_version:z.literal("attention-investigation-stock-cover-v1"),
  signal_id:z.string().regex(/^sig_[0-9a-f]{64}$/),signal_set_id:z.string().regex(/^mss_[0-9a-f]{64}$/),canonical_dataset_id:z.string(),signal_manifest_sha256:z.string().regex(/^[0-9a-f]{64}$/),canonical_manifest_sha256:z.string().regex(/^[0-9a-f]{64}$/),supply_model_sha256:z.string().nullable(),configuration_hash:z.string(),signal_as_of:z.iso.datetime({offset:true}),observation_date:z.iso.date(),
  signal_type:z.enum(["availability","demand_momentum","inventory_imbalance"]),direction:z.enum(["risk","acceleration","deceleration","excess"]),reference_weekly_demand:units,cover_status:z.enum(["available","zero_reference_demand"]),
  days:z.array(daySchema).max(420),weeks:z.array(weekSchema).max(80),receipts:z.array(receiptSchema).max(500),
  diagnostics:z.strictObject({baseline_ratio:optional,recent_ratio:optional,raw_multiplier:optional,multiplier:optional,error_allowance:optional,target_cover_days:optional,safety_days:optional,material_date:z.iso.date()}),
}).superRefine((v,ctx)=>{
  const keys=new Set<string>();
  const base=v.days.filter(d=>d.series==="base");
  const reference=base.map(d=>v.signal_type==="demand_momentum"?d.baseline:d.demand);
  if(reference.some(n=>n==null) || Math.abs(reference.reduce<number>((sum,n)=>sum+(n??0),0)/4-v.reference_weekly_demand)>.00001) ctx.addIssue({code:"custom",message:"Reference demand mismatch"});
  for(const d of v.days){
    const key=`${d.series}:${d.date}`;
    if(keys.has(key)) ctx.addIssue({code:"custom",message:"Duplicate day"}); keys.add(key);
    if(d.phase==="actual" && (d.date>v.observation_date || d.series!=="history")) ctx.addIssue({code:"custom",message:"Future actuals prohibited"});
    if(d.stock!==null && (v.reference_weekly_demand===0 ? d.cover!==null : d.cover===null || Math.abs(d.cover-d.stock/v.reference_weekly_demand)>.00001)) ctx.addIssue({code:"custom",message:"Cover mismatch"});
    if(d.target!==null && d.stock!==null && (d.excess==null || d.within_target==null || Math.abs(d.excess-Math.max(d.stock-d.target,0))>.00001 || Math.abs(d.stock-d.within_target-d.excess)>.00001)) ctx.addIssue({code:"custom",message:"Excess split mismatch"});
  }
  for(const s of new Set(v.days.filter(d=>d.phase==="projected").map(d=>d.series))){
    const rows=v.days.filter(d=>d.series===s);
    const expected=Array.from({length:28},(_,i)=>{const day=new Date(`${v.observation_date}T00:00:00Z`);day.setUTCDate(day.getUTCDate()+i+1);return day.toISOString().slice(0,10);});
    if(rows.length!==28 || expected.some(date=>!rows.some(d=>d.date===date))) ctx.addIssue({code:"custom",message:"Incomplete projected horizon"});
  }
  if(!v.days.some(d=>d.series==="base") || new Set(v.weeks.map(w=>w.key)).size!==v.weeks.length || new Set(v.receipts.map(r=>r.event_id)).size!==v.receipts.length) ctx.addIssue({code:"custom",message:"Invalid investigation references"});
  const groups=new Set(v.days.map(d=>`${d.series}:${d.week}`));
  if(groups.size!==v.weeks.length || v.weeks.some(w=>!groups.has(`${w.series}:${w.week}`))) ctx.addIssue({code:"custom",message:"Incomplete weekly references"});
  for(const w of v.weeks){
    const days=v.days.filter(d=>d.series===w.series&&d.week===w.week).sort((a,b)=>a.date.localeCompare(b.date));
    if(!days.length || days.length!==w.days || days[0].date!==w.start || days.at(-1)?.date!==w.end || w.partial!==(w.days!==7) || w.opening!==days[0].opening || w.stock!==days.at(-1)?.stock) ctx.addIssue({code:"custom",message:"Weekly balance mismatch"});
    for(const field of ["sales","receipts","demand","fulfilled","lost","baseline","adjusted","gap"] as const){
      const expected=days.some(d=>d[field]==null)?null:days.reduce((sum,d)=>sum+(d[field]??0),0);
      if((expected==null)!==(w[field]==null) || expected!=null&&w[field]!=null&&Math.abs(expected-w[field])>.00001) ctx.addIssue({code:"custom",message:"Weekly flow mismatch"});
    }
    if(w.forecast_vintage!=null&&w.forecast_vintage>=w.week) ctx.addIssue({code:"custom",message:"Invalid forecast vintage"});
  }
  if(v.receipts.some(r=>r.known_at!=null&&Date.parse(r.known_at)>Date.parse(v.signal_as_of))) ctx.addIssue({code:"custom",message:"Future order knowledge prohibited"});
});
export type Investigation=z.infer<typeof investigationSchema>;
export type Day=z.infer<typeof daySchema>;
export type Week=z.infer<typeof weekSchema>;

export async function fetchInvestigation(id:string,release:string,signal:AbortSignal):Promise<Investigation>{
  const response=await fetch(`/api/signals/${encodeURIComponent(id)}/investigation?signal_set_id=${encodeURIComponent(release)}`,{signal,cache:"no-store"});
  if(response.status===409) throw new Error("release_changed");
  if(!response.ok) throw new Error("investigation_unavailable");
  return investigationSchema.parse(await response.json());
}
