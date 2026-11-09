import type { Evidence, Finding } from "./schema";

type ValuationExport = {
  model_version: string;
  assumptions: unknown;
  members: ReadonlyArray<{
    location_id: string;
    product_id: string;
    [key: string]: unknown;
  }>;
};

// Text is untrusted, including item/store names. Keep genuine numbers numeric.
export function csvCell(value: unknown): string {
  const text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const safe =
    typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)
      ? `'${text}`
      : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function evidenceCsv(
  release: string,
  finding: Finding,
  evidence: Evidence[],
  valuation?: ValuationExport,
) {
  const valued = new Map(
    valuation?.members.map((row) => [row.location_id, row]) ?? [],
  );
  if (
    valuation &&
    (valuation.members.length !== evidence.length ||
      valued.size !== evidence.length ||
      evidence.some(
        (row) => valued.get(row.location_id)?.product_id !== row.product_id,
      ))
  )
    throw new Error(
      "Complete release-matched valuation evidence is required for export.",
    );
  if (
    evidence.length !== finding.affected_store_count ||
    new Set(evidence.map((row) => row.location_id)).size !== evidence.length ||
    evidence.some(
      (row) =>
        row.finding_id !== finding.finding_id ||
        row.product_id !== finding.product_id,
    )
  )
    throw new Error(
      "Complete release-matched member evidence is required for export.",
    );
  const headers = [
    "metric_release_id",
    "finding_id",
    "product_id",
    "location_id",
    "finding_code",
    "as_of",
    "supply_basis",
    "units_basis",
    "event_date",
    "plan_review_date",
    "units",
    "retail_exposure_usd",
    "inventory_capital_usd",
    "carrying_cost_28d_usd",
    "interpretation",
    "missing_evidence",
    "limitations",
    "context_json",
    "facts_json",
    ...(valuation
      ? ["valuation_model", "valuation_assumptions", "valuation_json"]
      : []),
  ];
  const rows = evidence.map((row) => [
    release,
    row.finding_id,
    row.product_id,
    row.location_id,
    row.finding_code,
    finding.as_of,
    finding.supply_basis,
    finding.units_basis,
    row.event_date,
    row.plan_review_date,
    row.units,
    row.retail_exposure_amount,
    row.inventory_capital_amount,
    row.carrying_cost_28d_amount,
    finding.interpretation,
    row.missing_evidence,
    finding.limitations,
    finding.context_json,
    row.facts_json,
    ...(valuation
      ? [
          valuation.model_version,
          valuation.assumptions,
          valued.get(row.location_id),
        ]
      : []),
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

export function downloadEvidence(
  release: string,
  finding: Finding,
  evidence: Evidence[],
  valuation?: ValuationExport,
) {
  const csv = evidenceCsv(release, finding, evidence, valuation);
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${finding.finding_code}-${finding.product_id}-${release.slice(0, 16)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
