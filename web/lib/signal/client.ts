import { type ZodType } from "zod";
import { workspacePath } from "../workspace-path";
import { mondayReportSchema, signalDetailSchema, signalQueueSchema, type MondayReport, type SignalDetail, type SignalQueue, type SignalType } from "./schema";

async function validated<T>(url: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(workspacePath(url), { cache: "no-store", signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("The selected publication is unavailable or failed validation.");
  return schema.parse(await response.json());
}
export function fetchReport(signalSetId?: string, signal?: AbortSignal): Promise<MondayReport> {
  const query = new URLSearchParams(signalSetId ? { signal_set_id: signalSetId } : {});
  return validated(`/api/signals/report?${query}`, mondayReportSchema, signal);
}
export function fetchSignalQueue(type?: SignalType, signal?: AbortSignal, signalSetId?: string): Promise<SignalQueue> {
  const query = new URLSearchParams();
  if (type) query.set("signal_type", type);
  if (type === "demand_momentum") query.set("signal_direction", "acceleration");
  if (signalSetId) query.set("signal_set_id", signalSetId);
  return validated(`/api/signals?${query}`, signalQueueSchema, signal);
}
export function fetchSignalDetail(id: string, signal?: AbortSignal, signalSetId?: string): Promise<SignalDetail> {
  const query = new URLSearchParams(signalSetId ? { signal_set_id: signalSetId } : {});
  return validated(`/api/signals/${encodeURIComponent(id)}?${query}`, signalDetailSchema, signal);
}
