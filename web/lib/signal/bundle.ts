import { z } from "zod";
import { mondayReportSchema, signalDetailSchema, signalQueueSchema } from "./schema";

export const demoBundleSchema = z.strictObject({
  demo_id: z.literal("demo-1"), classification: z.literal("synthetic"),
  report: mondayReportSchema, queues: z.record(z.string(), signalQueueSchema),
  details: z.record(z.string(), signalDetailSchema),
}).superRefine((bundle, context) => {
  const run = bundle.report.run;
  if (bundle.report.scope.classification !== "synthetic") context.addIssue({ code: "custom", message: "Customer publications cannot be demo bundles" });
  const fail = () => context.addIssue({ code: "custom", message: "Demo bundle must bind one complete publication" });
  for (const key of ["all", "availability", "inventory_imbalance", "demand_momentum", "demand_momentum:acceleration", "demand_momentum:deceleration"]) if (!bundle.queues[key]) fail();
  for (const [key, queue] of Object.entries(bundle.queues)) {
    if (JSON.stringify(queue.run) !== JSON.stringify(run)) fail();
    const [type, direction] = key.split(":");
    if (queue.signals.some((row) => type !== "all" && (row.signal_type !== type || direction && row.signal_direction !== direction))) fail();
    for (const row of queue.signals) {
      const detail = bundle.details[row.signal_id];
      if (!detail || detail.signal.signal_id !== row.signal_id || detail.signal.canonical_dataset_id !== run.canonical_dataset_id || detail.signal.configuration_hash !== run.configuration_hash || detail.signal.overall_rank_position !== row.overall_rank_position) fail();
    }
  }
  for (const card of bundle.report.categories) {
    const key = card.signal_type === "demand_momentum" ? "demand_momentum:acceleration" : card.signal_type;
    if (bundle.queues[key]?.signals[0]?.signal_id !== card.leading_signal?.signal_id) fail();
  }
});

export function demoResponse(bundle: z.infer<typeof demoBundleSchema>, path: string[], query: URLSearchParams): { status: number; body: unknown } {
  const error = (status: number, message: string) => ({ status, body: { api_contract_version: "memento-signal-api-v1", code: "demo_request_error", message } });
  const pinned = query.get("signal_set_id");
  if (pinned !== null && pinned !== bundle.report.run.signal_set_id) return error(503, "The pinned demo publication is unavailable.");
  if (path.length === 1 && path[0] === "report") return { status: 200, body: bundle.report };
  if (path.length === 1) {
    if (!/^sig_[a-f0-9]{64}$/.test(path[0])) return error(422, "Invalid signal identifier.");
    return bundle.details[path[0]] ? { status: 200, body: bundle.details[path[0]] } : error(404, "Signal not in this demo publication.");
  }
  if (path.length !== 0) return error(404, "Unknown demo endpoint.");
  const type = query.get("signal_type");
  const direction = query.get("signal_direction");
  if (type !== null && !["availability", "inventory_imbalance", "demand_momentum"].includes(type) || direction !== null && (type !== "demand_momentum" || !["acceleration", "deceleration"].includes(direction))) return error(422, "Invalid signal filter.");
  const key = type ? `${type}${direction ? `:${direction}` : ""}` : "all";
  return { status: 200, body: bundle.queues[key] };
}
