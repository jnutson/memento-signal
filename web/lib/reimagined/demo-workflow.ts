import { z } from "zod";
import type { Finding } from "@/lib/connected/schema";

// Original prototype controls. They record local demo intent, not execution,
// action feasibility, benefit estimates or a backend approval workflow.
export const statuses = [
  "proposed",
  "sent",
  "approved",
  "done",
  "declined",
] as const;
export const statusSchema = z.preprocess(
  (value) =>
    ({
      "proposed (demo)": "proposed",
      "reviewed (demo)": "sent",
      "approved (demo)": "approved",
      "complete (demo)": "done",
      "declined (demo)": "declined",
    })[String(value)] ?? value,
  z.enum(statuses),
);
export const statusColors = {
  proposed: ["#55554f", "#f0f0ee"],
  sent: ["#b86a00", "#fdf1df"],
  approved: ["#1f7a42", "#e8f5ec"],
  done: ["#1f7a42", "#e8f5ec"],
  declined: ["#d92d20", "#fdeceb"],
};
export const statusDots = {
  proposed: "#a6a6a0",
  sent: "#e8890c",
  approved: "#1f9d55",
  done: "#1f9d55",
  declined: "#d92d20",
};
export function demoActions(finding: Finding | undefined, check: string) {
  if (!finding) return [];
  const names = ["future_supply_gap", "conditional_plan_dependency"].includes(
    finding.finding_code,
  )
    ? ["Transfer", "Expedite PO"]
    : ["current_out_of_stock", "promised_distribution_gap"].includes(
          finding.finding_code,
        )
      ? ["Expedite restock", "Resolve distribution"]
      : finding.promise === "excess"
        ? ["Cut inbound", "Markdown"]
        : [];
  return [
    ...names.map((name) => ({
      key: name,
      label: name,
      sub: "Timing and benefit not modeled",
    })),
    { key: "Watch", label: "Watch", sub: `check ${check}` },
  ];
}
export function checkInDate(observed: string) {
  const day = new Date(`${observed}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 8); // release cutoff + seven days
  return day.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
