import { describe, expect, it } from "vitest";
import { demoBundleSchema, demoResponse } from "@/lib/signal/bundle";
import { detailFor, report, run, signals } from "./signal-fixtures";

const queue = (rows: typeof signals) => ({ api_contract_version: "memento-signal-api-v1", run, signals: rows });
const raw = { demo_id: "demo-1", classification: "synthetic", report,
  queues: { all: queue(signals), availability: queue([signals[0]]), inventory_imbalance: queue([signals[2]]), demand_momentum: queue([signals[1]]), "demand_momentum:acceleration": queue([signals[1]]), "demand_momentum:deceleration": queue([]) },
  details: Object.fromEntries(signals.map((s) => [s.signal_id, detailFor(s)])),
};
describe("Frozen hosted demo", () => {
  it("serves the existing report, filtered queue and evidence without changing rank", () => {
    const bundle = demoBundleSchema.parse(raw);
    expect(demoResponse(bundle, ["report"], new URLSearchParams()).status).toBe(200);
    expect(demoResponse(bundle, [], new URLSearchParams({ signal_type: "demand_momentum", signal_direction: "acceleration" })).body).toEqual(bundle.queues["demand_momentum:acceleration"]);
    expect(demoResponse(bundle, [signals[0].signal_id], new URLSearchParams()).body).toEqual(bundle.details[signals[0].signal_id]);
    expect(demoResponse(bundle, [], new URLSearchParams({ signal_set_id: "missing" })).status).toBe(503);
    expect(demoResponse(bundle, [], new URLSearchParams({ signal_type: "unknown" })).status).toBe(422);
  });
  it("rejects missing evidence and mixed publications", () => {
    expect(demoBundleSchema.safeParse({ ...raw, details: {} }).success).toBe(false);
    expect(demoBundleSchema.safeParse({ ...raw, classification: "customer" }).success).toBe(false);
    expect(demoBundleSchema.safeParse({ ...raw, report: { ...report, scope: { ...report.scope, classification: "confidential_customer" } } }).success).toBe(false);
    const mixed = structuredClone(raw);
    mixed.queues.availability.run = { ...run, configuration_hash: "f".repeat(64) };
    expect(demoBundleSchema.safeParse(mixed).success).toBe(false);
  });
});
