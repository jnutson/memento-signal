"use client";

import { useEffect, useState } from "react";
import {
  metricMetadata,
  metricPage,
  type MetricKind,
  type MetricMetadata,
  type MetricPage,
  type MetricRow,
} from "../../lib/metrics";
import styles from "./MetricsBrowser.module.css";

const views: { kind: MetricKind; label: string; explanation: string }[] = [
  {
    kind: "periods",
    label: "Sales & velocity",
    explanation:
      "Realized net sales over completed periods. Real zero-sales and zero-stock days stay in the denominator; missing days reduce coverage. Trends compare the same stores, not an expanding footprint.",
  },
  {
    kind: "stores",
    label: "Store inventory",
    explanation:
      "Every store-item is accessible. Reported zero on hand is not proof of an empty shelf. Missing or stale inventory is unknown, not a stockout.",
  },
  {
    kind: "distribution",
    label: "Promised distribution",
    explanation:
      "Due promises only. Promised = stocked + confirmed zero + unknown. Unconfirmed distribution combines confirmed zeros and unknowns; they remain visible separately.",
  },
  {
    kind: "weekday",
    label: "Weekday pattern",
    explanation:
      "Eight completed weeks of observed sales, adjusted for weekday exposure. An index of 1 is average. No uniform fallback is shown when the pattern cannot be measured.",
  },
  {
    kind: "checks",
    label: "Basic checks",
    explanation:
      "Observable exceptions for human review, independent of forecast readiness. These are checks, not recommended actions. A store may have more than one check.",
  },
];

const columns: Record<MetricKind, [string, string][]> = {
  periods: [
    ["scope_name", "Store / group"],
    ["product_id", "Item"],
    ["period_start", "Period start"],
    ["units", "Units"],
    ["dollars", "Retail sales $"],
    ["store_day_rate", "Units/store/day"],
    ["units_store_week", "U/store/week"],
    ["dollars_store_week", "$/store/week"],
    ["sales_coverage", "Sales coverage"],
    ["reported_oos_rate", "Reported OOS rate"],
    ["inventory_coverage", "Inventory coverage"],
    ["trend_pct", "Same-store change"],
    ["rate_change", "Rate change (units/day)"],
    ["adjusted_unit_change", "Adjusted unit change"],
    ["same_store_count", "Comparable stores"],
    ["same_store_coverage", "Comparable coverage"],
    ["trend_highlight", "Relevant trend"],
  ],
  stores: [
    ["location_name", "Store"],
    ["product_name", "Item"],
    ["region", "Region"],
    ["tier", "Frozen tier"],
    ["inventory_date", "Inventory date"],
    ["on_hand", "Reported units"],
    ["current_state", "Current state"],
    ["stocking_due_date", "Stocking due"],
    ["distribution_state", "Distribution"],
  ],
  distribution: [
    ["scope_name", "Store / group"],
    ["product_id", "Item"],
    ["promised_stores", "Promised"],
    ["stocked_stores", "Stocked"],
    ["confirmed_zero_stores", "Confirmed zero"],
    ["unknown_stores", "Unknown"],
    ["unconfirmed_stores", "Unconfirmed"],
  ],
  weekday: [
    ["scope_name", "Store / group"],
    ["product_id", "Item"],
    ["weekday", "Weekday"],
    ["units", "Units"],
    ["sales_days", "Observed store-days"],
    ["sales_coverage", "Sales coverage"],
    ["weekday_rate", "Units/store/day"],
    ["weekday_share", "Weekday share"],
    ["weekday_index", "Weekday index"],
    ["pattern_status", "Pattern status"],
  ],
  checks: [
    ["location_name", "Store"],
    ["product_name", "Item"],
    ["check_code", "Check"],
    ["explanation", "What this means"],
  ],
};

const percentFields = new Set([
  "sales_coverage",
  "inventory_coverage",
  "reported_oos_rate",
  "weekday_share",
  "same_store_coverage",
]);
const weekdayNames = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function formatCell(
  row: MetricRow,
  field: string,
  metadata: MetricMetadata,
): string {
  const value = row[field];
  if (field === "product_id")
    return (
      metadata.items.find((item) => item.product_id === value)?.product_name ??
      "Unknown item"
    );
  if (value === null || value === undefined) {
    if (field === "trend_pct" && row.trend_status === "from_zero")
      return "From zero";
    return "Unavailable";
  }
  if (field === "weekday") return weekdayNames[Number(value)] ?? "Unknown";
  if (field === "trend_highlight")
    return value
      ? Number(row.trend_pct) > 0
        ? "Increasing"
        : "Decreasing"
      : "—";
  if (typeof value === "number") {
    if (percentFields.has(field)) return `${(value * 100).toFixed(1)}%`;
    if (field === "trend_pct")
      return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return String(value).replaceAll("_", " ");
}

export default function MetricsBrowser() {
  const [metadata, setMetadata] = useState<MetricMetadata | null>(null);
  const [page, setPage] = useState<MetricPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<MetricKind>("periods");
  const [grain, setGrain] = useState("item");
  const [item, setItem] = useState("");
  const [periodKind, setPeriodKind] = useState("week");
  const [periodStart, setPeriodStart] = useState("");
  const [scope, setScope] = useState("");
  const [highlights, setHighlights] = useState(false);
  const [offset, setOffset] = useState(0);
  const [checkCode, setCheckCode] = useState("");
  const [currentState, setCurrentState] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/metrics/metadata", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Metrics are not published or failed validation.");
        return metricMetadata.parse(await response.json());
      })
      .then((result) => {
        setMetadata(result);
        setItem(result.items[0]?.product_id ?? "");
        setPeriodStart(
          result.periods.find((period) => period.period_kind === "week")
            ?.period_start ?? "",
        );
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Metrics could not be loaded.",
          );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!metadata) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      release_id: metadata.metric_release_id,
      grain,
      period_kind: periodKind,
      limit: "50",
      offset: String(offset),
    });
    if (item) query.set("product_id", item);
    if (scope) query.set("scope_id", scope);
    if (kind === "periods" && periodStart)
      query.set("period_start", periodStart);
    if (highlights && kind === "periods") query.set("highlights_only", "true");
    if (checkCode && kind === "checks") query.set("check_code", checkCode);
    if (currentState && kind === "stores")
      query.set("current_state", currentState);
    // Clear stale rows while a new, release-pinned selection is loading.
    const request = async () => {
      setLoading(true);
      setError("");
      setPage(null);
      try {
        const response = await fetch(`/api/metrics/${kind}?${query}`, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            "Metrics could not be loaded. No sample values have been substituted.",
          );
        const result = metricPage.parse(await response.json());
        if (
          result.metric_release_id !== metadata.metric_release_id ||
          result.kind !== kind
        )
          throw new Error(
            "Metric release mismatch. Reload to use a consistent release.",
          );
        if (!controller.signal.aborted) setPage(result);
      } catch (reason: unknown) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Metrics could not be loaded.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void request();
    return () => controller.abort();
  }, [
    metadata,
    kind,
    grain,
    item,
    periodKind,
    periodStart,
    scope,
    highlights,
    offset,
    checkCode,
    currentState,
  ]);

  const reset = () => setOffset(0);
  const showStore = (row: MetricRow) => {
    setScope(String(row.location_id));
    setItem(String(row.product_id));
    setKind("periods");
    setGrain("store");
    setPeriodStart("");
    setHighlights(false);
    reset();
  };

  return (
    <section className={styles.browser}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>OBSERVABLE RETAIL PERFORMANCE</p>
          <h1>Metrics</h1>
        </div>
        {metadata && (
          <span>Closed observations through {metadata.observation_date}</span>
        )}
      </header>
      <p>
        Basic metrics you can inspect. Checks when something is wrong. Trends
        when the movement is relevant.
      </p>
      {metadata && (
        <>
          <div className={styles.summary}>
            <div>
              <strong>{metadata.population.toLocaleString()}</strong>
              <span>Store-items covered · all items</span>
            </div>
            <div>
              <strong>
                {(metadata.states.reported_zero_on_hand ?? 0).toLocaleString()}
              </strong>
              <span>Reported zero on hand</span>
            </div>
            <div>
              <strong>
                {(metadata.states.unknown_inventory ?? 0).toLocaleString()}
              </strong>
              <span>Unknown inventory</span>
            </div>
          </div>
          <nav className={styles.tabs} aria-label="Metric views">
            {views.map((view) => (
              <button
                key={view.kind}
                aria-pressed={kind === view.kind}
                onClick={() => {
                  setKind(view.kind);
                  reset();
                }}
              >
                {view.label}
              </button>
            ))}
          </nav>
          <p className={styles.explanation}>
            {views.find((view) => view.kind === kind)?.explanation}
          </p>
          <div className={styles.filters}>
            <label>
              Item
              <select
                value={item}
                onChange={(event) => {
                  setItem(event.target.value);
                  reset();
                }}
              >
                <option value="">All items</option>
                {metadata.items.map((product) => (
                  <option key={product.product_id} value={product.product_id}>
                    {product.product_name}
                  </option>
                ))}
              </select>
            </label>
            {!["stores", "checks"].includes(kind) && (
              <label>
                Group by
                <select
                  value={grain}
                  onChange={(event) => {
                    setGrain(event.target.value);
                    setScope("");
                    reset();
                  }}
                >
                  <option value="item">Item</option>
                  <option value="store">Store</option>
                  <option value="region">Region</option>
                  <option value="tier">Store tier</option>
                </select>
              </label>
            )}
            {kind === "periods" && (
              <>
                <label>
                  Period
                  <select
                    value={periodKind}
                    onChange={(event) => {
                      setPeriodKind(event.target.value);
                      setPeriodStart(
                        metadata.periods.find(
                          (period) => period.period_kind === event.target.value,
                        )?.period_start ?? "",
                      );
                      reset();
                    }}
                  >
                    <option value="week">Completed week</option>
                    <option value="month">Completed calendar month</option>
                  </select>
                </label>
                <label>
                  Starting
                  <select
                    value={periodStart}
                    onChange={(event) => {
                      setPeriodStart(event.target.value);
                      reset();
                    }}
                  >
                    <option value="">All history</option>
                    {metadata.periods
                      .filter((period) => period.period_kind === periodKind)
                      .map((period) => (
                        <option
                          key={period.period_start}
                          value={period.period_start}
                        >
                          {period.period_start} – {period.period_end}
                        </option>
                      ))}
                  </select>
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={highlights}
                    onChange={(event) => {
                      setHighlights(event.target.checked);
                      reset();
                    }}
                  />
                  Relevant trends only
                </label>
              </>
            )}
            {scope && (
              <button
                className={styles.clear}
                onClick={() => {
                  setScope("");
                  reset();
                }}
              >
                Clear selected store
              </button>
            )}
            {kind === "checks" && (
              <label>
                Check
                <select
                  value={checkCode}
                  onChange={(event) => {
                    setCheckCode(event.target.value);
                    reset();
                  }}
                >
                  <option value="">All checks</option>
                  <option value="reported_zero_on_hand">
                    Reported zero on hand
                  </option>
                  <option value="inventory_unknown">
                    Missing or stale inventory
                  </option>
                  <option value="promised_distribution_gap">
                    Promised distribution gap
                  </option>
                </select>
              </label>
            )}
            {kind === "stores" && (
              <label>
                Current state
                <select
                  value={currentState}
                  onChange={(event) => {
                    setCurrentState(event.target.value);
                    reset();
                  }}
                >
                  <option value="">All states</option>
                  <option value="reported_zero_on_hand">
                    Reported zero on hand
                  </option>
                  <option value="unknown_inventory">Unknown inventory</option>
                  <option value="positive_reported_inventory">
                    Positive reported inventory
                  </option>
                  <option value="not_applicable">Not applicable</option>
                </select>
              </label>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {(!metadata && !error) || loading ? (
        <p role="status">Loading metrics…</p>
      ) : null}
      {metadata && page && !loading && (
        <>
          <div className={styles.tableWrap}>
            <table>
              <caption>
                {views.find((view) => view.kind === kind)?.label}:{" "}
                {page.total.toLocaleString()} results
              </caption>
              <thead>
                <tr>
                  {columns[kind].map(([field, label]) => (
                    <th key={field} scope="col">
                      {label}
                    </th>
                  ))}
                  {["stores", "checks"].includes(kind) && (
                    <th scope="col">History</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row, index) => (
                  <tr
                    key={`${row.scope_id ?? row.location_id}-${row.product_id}-${row.period_start ?? row.weekday ?? row.check_code ?? index}`}
                  >
                    {columns[kind].map(([field]) => (
                      <td key={field}>{formatCell(row, field, metadata)}</td>
                    ))}
                    {["stores", "checks"].includes(kind) && (
                      <td>
                        <button
                          className={styles.link}
                          onClick={() => showStore(row)}
                          aria-label={`View metrics for ${row.location_name ?? row.location_id}`}
                        >
                          View metrics
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.rows.length === 0 && (
            <p className={styles.empty}>
              No results for this selection. Basic metrics remain available with
              the trend filter off.
            </p>
          )}
          <div className={styles.pagination}>
            <span>
              {page.total ? offset + 1 : 0}–
              {Math.min(offset + page.rows.length, page.total)} of{" "}
              {page.total.toLocaleString()}
            </span>
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous
            </button>
            <button
              disabled={offset + 50 >= page.total}
              onClick={() => setOffset(offset + 50)}
            >
              Next
            </button>
          </div>
        </>
      )}
      {metadata && (
        <details className={styles.definitions}>
          <summary>Definitions, assumptions & release</summary>
          <p>
            Contract: {metadata.contract_version}. Tiers frozen using the 56
            days ending {metadata.configuration.tier_baseline_end}.
          </p>
          <p>
            Trend highlights: ≥{metadata.configuration.minimum_coverage * 100}%
            comparable coverage, ≥{metadata.configuration.trend_percent}% rate
            movement, ≥{metadata.configuration.trend_minimum_units}{" "}
            exposure-adjusted units, {metadata.configuration.weekly_persistence}{" "}
            consecutive weekly comparisons or one monthly comparison.
          </p>
          <dl>
            {Object.entries(metadata.formulas).map(([name, formula]) => (
              <div key={name}>
                <dt>{name.replaceAll("_", " ")}</dt>
                <dd>{formula}</dd>
              </div>
            ))}
          </dl>
          {metadata.limitations.map((limitation) => (
            <p key={limitation}>{limitation}</p>
          ))}
          <p className={styles.release}>{metadata.metric_release_id}</p>
        </details>
      )}
    </section>
  );
}
