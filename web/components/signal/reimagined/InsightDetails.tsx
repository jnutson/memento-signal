"use client";
import { Fragment, useMemo, useState } from "react";
import {
  buildDetails,
  completeSum,
  type DetailRow,
  type DetailsInput,
  type DetailsModel,
} from "@/lib/reimagined/details-model";
import { attentionDollars } from "@/lib/reimagined/attention-view";
import {
  compactMoney as money,
  wholeUnits as number,
} from "@/lib/reimagined/presentation";
import DetailChart from "./DetailChart";
import styles from "./InsightDetails.module.css";

const dateLabel = (value: string | null) =>
  value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "Unavailable";
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.fact}>
      <strong>{label}</strong>
      {children}
    </div>
  );
}

function StoreEvidence({
  row,
  model,
}: {
  row: DetailRow;
  model: DetailsModel;
}) {
  const v = row.valuation,
    f = row.evidence.facts;
  const orders = model.series.firm_orders.filter(
    (order) => order.location_id === row.id,
  );
  const plans = f.plans.filter((plan) => plan.remaining_planned_qty > 0);
  return (
    <div className={styles.facts}>
      <Fact label="Store / region">
        {row.name} · {row.region}
      </Fact>
      <Fact label="Observed on hand">
        {number(f.on_hand)} units · {model.attention.observation_date}
      </Fact>
      {model.value.lane === "z" ? (
        <>
          <Fact label="Sales baseline">
            {money(row.baseline)}/day ·{" "}
            {v.baseline_basis === "own_store_in_stock_sales"
              ? `${number(v.in_stock_sales_days)} observed in-stock days before this episode`
              : v.baseline_basis ===
                  "current_retailer_forecast_proxy_not_historical_sales"
                ? "Retailer forecast proxy · not observed in-stock sales"
                : "Unavailable"}
          </Fact>
          <Fact label="Current zero episode">
            {dateLabel(v.episode_start_date)} · {number(row.zeroDays)} observed
            days
          </Fact>
          <Fact label="Missed sales to date (estimated)">
            {money(v.retrospective_amount)} · max(0, {money(row.baseline)}/day ×{" "}
            {number(row.zeroDays)} days − {money(v.recorded_episode_retail)}{" "}
            recorded sales)
          </Fact>
          <Fact label="Forward exposure (estimated)">
            {money(v.forward_amount)} · through {dateLabel(v.window_end_date)}.{" "}
            {v.receipt_basis ===
            "assumed_existing_brand_stock_and_new_authorized_po"
              ? `${model.attention.assumptions.replenishment_days}-day scenario; assumes ready brand stock and PO authorization, not a booked receipt.`
              : v.receipt_basis ===
                  "partial_firm_receipts_no_recovery_within_28d"
                ? "Partial firm receipts do not resolve the shortage within 28 days."
                : v.receipt_basis === "dated_firm_receipts"
                  ? "Published Walmart demand and dated firm receipts through projected recovery."
                  : "Complete forecast or firm receipt evidence is missing."}
          </Fact>
        </>
      ) : model.value.lane === "a" ? (
        <>
          <Fact label="Walmart forecast, next 28 days">
            {number(row.demand)} units
          </Fact>
          <Fact label="Firm-only / including-plans shortfall">
            {number(f.firm_unfulfilled_units)} /{" "}
            {number(f.conditional_unfulfilled_units)} units · alternative
            scenarios
          </Fact>
          <Fact label="First shortage including plans">
            {dateLabel(row.shortage)} · not an action deadline
          </Fact>
          <Fact label="Retail exposure calculation">
            {number(row.uncovered)} uncovered units ×{" "}
            {money(v.unit_retail_amount)} retail/unit ≈ {money(v.amount)}
          </Fact>
        </>
      ) : (
        <>
          <Fact label="Projected / target stock">
            {number(row.projected)} / {number(row.target)} units · day 28
          </Fact>
          <Fact label="Capital calculation">
            {number(row.excess)} excess units ×{" "}
            {money(
              typeof f.unit_cost_amount === "number"
                ? f.unit_cost_amount
                : null,
            )}{" "}
            unit cost ≈ {money(v.amount)}
          </Fact>
          <Fact label="Projection basis">
            {model.conditionalExcess
              ? "Including eligible plans · conditional"
              : "Firm supply only"}
            . The other line is a comparison, not additional inventory.
          </Fact>
          <Fact label="Carrying cost, 28 days">
            {money(row.evidence.carrying_cost_28d_amount)}
            {row.evidence.carrying_cost_28d_amount === null
              ? " · approved carrying rate not supplied"
              : " · published approved rate"}
          </Fact>
        </>
      )}
      <div className={styles.full}>
        <strong>Firm receipts</strong>
        {orders.length ? (
          <ul>
            {orders.map((order, i) => (
              <li key={`${order.retailer_order_id}:${i}`}>
                {dateLabel(order.expected_store_receipt_date)} ·{" "}
                {number(order.outstanding_units)} units{" "}
                <details>
                  <summary className={styles.muted}>
                    Source order reference
                  </summary>
                  {order.retailer_order_id}
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p>No dated firm receipts included in the published projection.</p>
        )}
      </div>
      <div className={styles.full}>
        <strong>Planned quantities · not firm</strong>
        {plans.length ? (
          <ul>
            {plans.map((plan, i) => (
              <li key={`${plan.plan_id}:${i}`}>
                {number(plan.remaining_planned_qty)} units · placement{" "}
                {dateLabel(plan.order_place_dt)} → arrival{" "}
                {dateLabel(plan.sched_arvl_dt)} ·{" "}
                {plan.eligible_for_projection
                  ? "included conditionally"
                  : "excluded from projection"}
                <details>
                  <summary className={styles.muted}>
                    Source plan reference
                  </summary>
                  {plan.plan_id}
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p>No remaining planned quantity in this store’s evidence.</p>
        )}
      </div>
      <Fact label="Source estimate · rounded">
        {money(v.amount)} · estimated{" "}
        {model.value.lane === "i"
          ? "capital, not markdown loss"
          : "retail exposure, not measured losses"}
      </Fact>
      <Fact label="Source identity">
        {row.id} · {model.attention.model_version}
      </Fact>
    </div>
  );
}

function InboundSummary({ model }: { model: DetailsModel }) {
  const groups = new Map<
    string,
    {
      date: string;
      kind: string;
      units: number;
      stores: Set<string>;
      lines: number;
    }
  >();
  const add = (date: string, kind: string, units: number, location: string) => {
    const key = `${date}:${kind}`,
      group = groups.get(key) ?? {
        date,
        kind,
        units: 0,
        stores: new Set<string>(),
        lines: 0,
      };
    group.units += units;
    group.stores.add(location);
    group.lines++;
    groups.set(key, group);
  };
  model.series.firm_orders.forEach((order) =>
    add(
      order.expected_store_receipt_date,
      "Firm",
      order.outstanding_units,
      order.location_id,
    ),
  );
  model.evidence.forEach((row) =>
    row.facts.plans
      .filter((plan) => plan.remaining_planned_qty > 0)
      .forEach((plan) =>
        add(
          plan.sched_arvl_dt,
          plan.eligible_for_projection
            ? "Planned · conditional"
            : "Planned · excluded",
          plan.remaining_planned_qty,
          row.location_id,
        ),
      ),
  );
  const rows = [...groups.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind),
  );
  return (
    <section className={`${styles.card} ${styles.disclosure}`}>
      <details>
        <summary>
          Firm inbound &amp; planned quantities · {rows.length} receipt{" "}
          {rows.length === 1 ? "group" : "groups"}
        </summary>
        <p className={styles.muted}>
          Grouped by scheduled store-arrival date and status, not presented as
          invented orders. Store expansions retain source references and
          placement dates. Planned quantity is not firm supply or permission to
          change an order.
        </p>
        {rows.length ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Arrival</th>
                  <th>Status</th>
                  <th className={styles.right}>Units</th>
                  <th className={styles.right}>Stores / lines</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.date + row.kind}>
                    <td>{dateLabel(row.date)}</td>
                    <td>{row.kind}</td>
                    <td className={styles.right}>{number(row.units)}</td>
                    <td className={styles.right}>
                      {row.stores.size} / {row.lines}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No dated firm receipts or remaining planned quantities.</p>
        )}
      </details>
    </section>
  );
}

export default function InsightDetails({ input }: { input: DetailsInput }) {
  const { finding, evidence, series, attention, queue } = input;
  const result = useMemo(() => {
    try {
      return {
        model: buildDetails({ finding, evidence, series, attention, queue }),
        error: null,
      };
    } catch (error) {
      return {
        model: null,
        error:
          error instanceof Error
            ? error.message
            : "Detail evidence unavailable.",
      };
    }
  }, [finding, evidence, series, attention, queue]);
  const [search, setSearch] = useState(""),
    [region, setRegion] = useState("all"),
    [sort, setSort] = useState("dollars"),
    [page, setPage] = useState(0),
    [pageSize, setPageSize] = useState(10),
    [open, setOpen] = useState<string | null>(null);
  if (!result.model)
    return (
      <section className={styles.card} role="alert">
        <h2 className={styles.title}>Detail evidence unavailable</h2>
        <p className={styles.error}>{result.error}</p>
      </section>
    );
  const model = result.model,
    zero = model.value.lane === "z",
    gap = model.value.lane === "a";
  const regions = [...new Set(model.rows.map((row) => row.region))].sort();
  const rows = model.rows
    .filter(
      (row) =>
        (region === "all" || row.region === region) &&
        `${row.name} ${row.id} ${row.region}`
          .toLowerCase()
          .includes(search.toLowerCase().trim()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
        : sort === "days"
          ? (b.zeroDays ?? -1) - (a.zeroDays ?? -1) || a.id.localeCompare(b.id)
          : sort === "low"
            ? (a.amount === null ? 1 : 0) - (b.amount === null ? 1 : 0) ||
              (a.amount ?? 0) - (b.amount ?? 0) ||
              a.id.localeCompare(b.id)
            : (a.amount === null ? 1 : 0) - (b.amount === null ? 1 : 0) ||
              (b.amount ?? 0) - (a.amount ?? 0) ||
              a.id.localeCompare(b.id),
    );
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)),
    currentPage = Math.min(page, pages - 1),
    visible = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const heading = zero
    ? "Store-level missed sales & exposure"
    : gap
      ? "Store-level uncovered demand"
      : "Store-level excess inventory";
  const columns = zero
    ? [
        "Store",
        "Days at zero",
        "Sales baseline / week",
        "Receipt / assumption",
        "Estimated impact",
      ]
    : gap
      ? [
          "Store",
          "First shortage",
          "Demand, 28d",
          "Uncovered units",
          "Retail exposure",
        ]
      : [
          "Store",
          "Projected stock",
          "Target stock",
          "Excess units",
          "Capital at cost",
        ];
  const secondary = zero
    ? money(model.value.retrospective_amount)
    : gap
      ? `${number(model.uncoveredUnits)} units`
      : `${number(model.excessUnits)} units`;
  const third = zero
    ? money(model.value.forward_amount)
    : gap
      ? dateLabel(model.firstShortage)
      : `${number(model.targetUnits)} units`;
  return (
    <div
      className={styles.root}
      data-testid="insight-details"
      data-path={model.value.lane}
    >
      <div className={styles.summary}>
        {[
          {
            label: zero
              ? "Estimated missed sales + exposure"
              : gap
                ? "Projected retail exposure"
                : "Inventory capital at cost",
            value: attentionDollars(model.value),
          },
          {
            label: zero
              ? "Missed sales to date · estimated"
              : gap
                ? "Uncovered demand · including plans"
                : "Excess above target · day 28",
            value: secondary,
          },
          {
            label: zero
              ? "Forward exposure · estimated"
              : gap
                ? "First projected shortage"
                : "Declared target stock · day 28",
            value: third,
          },
        ].map((metric, i) => (
          <section key={metric.label} className={styles.card}>
            <div className={styles.label}>{metric.label}</div>
            <div
              className={styles.value}
              data-testid={i === 0 ? "detail-dollar-estimate" : undefined}
            >
              {metric.value}
            </div>
          </section>
        ))}
      </div>
      <div className={styles.scope}>
        Affected stores: {model.rows.length} · observed through{" "}
        {dateLabel(model.attention.observation_date)} ·{" "}
        {zero
          ? "current zero episode + replenishment window"
          : model.conditionalExcess
            ? "28-day projection including eligible plans · conditional"
            : gap
              ? "28-day projection including eligible plans"
              : "28-day firm-supply projection"}
        . Table filters do not change the full-finding headline or chart.
        {model.partial && (
          <div className={styles.warning}>
            Known subtotal only: {model.value.valued_count} of{" "}
            {model.value.member_count} stores valued. Unknown estimates are not
            zero. Component estimates may cover different stores and may not sum
            to this subtotal.
          </div>
        )}
      </div>
      <DetailChart model={model} />
      <section className={styles.card} aria-label={heading}>
        <h2 className={styles.title}>{heading}</h2>
        <div className={styles.controls}>
          <input
            className={styles.input}
            aria-label="Search affected stores"
            placeholder="Search stores"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
          <select
            className={styles.select}
            aria-label="Filter affected stores by region"
            value={region}
            onChange={(event) => {
              setRegion(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All regions</option>
            {regions.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <select
            className={styles.select}
            aria-label="Sort affected stores"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(0);
            }}
          >
            <option value="dollars">Dollars: high to low</option>
            <option value="low">Dollars: low to high</option>
            <option value="name">Store name</option>
            {zero && <option value="days">Longest at zero</option>}
          </select>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table} aria-label={heading}>
            <thead>
              <tr>
                {columns.map((name, i) => (
                  <th
                    className={i ? styles.right : undefined}
                    key={name}
                    scope="col"
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td>
                      <button
                        className={styles.store}
                        aria-expanded={open === row.id}
                        aria-controls={`detail-${row.id}`}
                        onClick={() => setOpen(open === row.id ? null : row.id)}
                      >
                        {open === row.id ? "▾" : "▸"} {row.name}
                      </button>
                      <div className={styles.muted}>{row.region}</div>
                    </td>
                    {zero ? (
                      <>
                        <td className={styles.right}>{number(row.zeroDays)}</td>
                        <td className={styles.right}>
                          {money(
                            row.baseline === null ? null : row.baseline * 7,
                          )}
                          <div className={styles.muted}>
                            {row.valuation.baseline_basis ===
                            "own_store_in_stock_sales"
                              ? "In-stock history"
                              : "Forecast proxy / unavailable"}
                          </div>
                        </td>
                        <td className={styles.right}>{row.receipt}</td>
                      </>
                    ) : gap ? (
                      <>
                        <td className={styles.right}>
                          {dateLabel(row.shortage)}
                        </td>
                        <td className={styles.right}>{number(row.demand)}</td>
                        <td className={styles.right}>
                          {number(row.uncovered)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={styles.right}>
                          {number(row.projected)}
                        </td>
                        <td className={styles.right}>{number(row.target)}</td>
                        <td className={styles.right}>{number(row.excess)}</td>
                      </>
                    )}
                    <td
                      className={styles.right}
                      data-amount-cents={row.cents ?? "unknown"}
                    >
                      {money(row.cents === null ? null : row.cents / 100)}
                    </td>
                  </tr>
                  {open === row.id && (
                    <tr className={styles.expanded} id={`detail-${row.id}`}>
                      <td colSpan={5}>
                        <StoreEvidence row={row} model={model} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={5}>No affected stores match these filters.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  {model.partial ? "Known subtotal" : "Full finding total"} ·
                  {model.rows.length} affected{" "}
                  {model.rows.length === 1 ? "store" : "stores"}
                </td>
                <td
                  className={styles.right}
                  data-testid="detail-ledger-total"
                  data-total-cents={model.totalCents ?? "unknown"}
                >
                  {money(
                    model.totalCents === null ? null : model.totalCents / 100,
                  )}
                  {model.partial && model.totalCents !== null ? "+" : ""}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className={styles.footer}>
          <span>
            {rows.length
              ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, rows.length)}`
              : "0"}{" "}
            of {rows.length} matching {rows.length === 1 ? "store" : "stores"} ·{" "}
            {model.rows.length} total
          </span>
          <div className={styles.controls}>
            <select
              className={styles.select}
              aria-label="Stores per page"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
            </select>
            <button
              className={styles.button}
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              Page {currentPage + 1} of {pages}
            </span>
            <button
              className={styles.button}
              disabled={currentPage + 1 >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
        <p className={styles.muted}>
          Expand a store for the calculation and receipts. Dollars and units are
          rounded for display; rounded rows may not add to the displayed total.
          Calculations and exports retain the exact source values.
        </p>
      </section>
      {!zero && <InboundSummary model={model} />}
      <section className={`${styles.card} ${styles.disclosure}`}>
        <details>
          <summary>Calculation &amp; assumptions</summary>
          <p>
            {zero
              ? "Estimated missed sales = max(0, daily baseline × observed zero days − recorded sales during the episode). Forward exposure uses Walmart’s forecast and firm receipts until recovery, or the declared replenishment scenario."
              : gap
                ? "Retail exposure = store-level uncovered units × published retail price, summed across all affected stores. Uncovered demand includes eligible plans conditionally; it is not a firm-only alarm."
                : "Inventory capital = max(0, projected stock − declared target stock) × unit cost, calculated per store and summed. It is not estimated markdown loss or action savings."}
          </p>
          {zero && (
            <p>
              When no firm receipt exists within 28 days:{" "}
              {attention.assumptions.replenishment_days} days ={" "}
              {attention.assumptions.po_authorization_days} PO authorization +{" "}
              {attention.assumptions.fulfillment_days} fulfillment +{" "}
              {attention.assumptions.brand_to_retailer_dc_days}{" "}
              brand-to-retailer DC +{" "}
              {attention.assumptions.retailer_dc_to_store_days} retailer
              DC-to-store. Ready brand stock and authorization are assumptions,
              not verified action feasibility.
            </p>
          )}
          {!zero && !gap && (
            <p>
              Carrying cost, 28 days:{" "}
              {money(
                completeSum(
                  model.evidence.map((row) => row.carrying_cost_28d_amount),
                ),
              )}
              . No carrying-cost chart is shown without a complete approved-rate
              calculation.
            </p>
          )}
          <p className={styles.muted}>{attention.limitation}</p>
          <p className={styles.muted}>
            Valuation: {attention.model_version}. Every displayed store belongs
            to this finding and release. The right-side evidence export includes
            all stores, independent of filters or pagination.
          </p>
          <details>
            <summary>Source release</summary>
            <div className={styles.fact}>{attention.metric_release_id}</div>
          </details>
        </details>
      </section>
    </div>
  );
}
