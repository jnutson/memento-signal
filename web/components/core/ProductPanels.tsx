"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Basis, ProductView, Tab } from "@/lib/core/schema";
import { day, money, number, detailUrl } from "@/lib/core/format";
import { allRows } from "@/lib/connected/client";
import { evidenceSchema, type Evidence } from "@/lib/connected/schema";
import { TimeChart } from "./TimeChart";
import css from "./Core.module.css";

export function ProductPanels({
  view,
  tab,
  basis,
}: {
  view: ProductView;
  tab: Tab;
  basis: Basis;
}) {
  const latest = view.sales_weeks.at(-1);
  const rows = view.projections.filter((r) => r.basis === basis);
  const economic = view.economics.find((r) => r.basis === basis);
  return (
    <>
      {tab === "Sales" ? (
        <>
          <dl className={css.facts}>
            <Fact
              title="Units recorded · last complete week"
              value={number(latest?.units)}
              note={
                latest
                  ? `${day(latest.period_start)}–${day(latest.period_end)}`
                  : "No complete week"
              }
            />
            <Fact
              title="Recorded retailer sales"
              value={money(latest?.dollars)}
              note="Retail dollars; not brand shipments"
            />
            <Fact
              title="Unit velocity"
              value={number(latest?.units_store_week, 1)}
              note="Units per observed store per week"
            />
          </dl>
          {latest && latest.sales_days !== latest.expected_days && (
            <p className={css.notice}>
              Partial sales coverage: {latest.sales_days}/{latest.expected_days}{" "}
              expected store-item days observed. Values summarize available
              records.
            </p>
          )}
          <section className={css.panel}>
            <h2>Weekly sales performance</h2>
            <p className={css.muted}>
              Original reporting dates · eligible sales records. Partial
              coverage is shown in the table.
            </p>
            <TimeChart
              title="Weekly units sold"
              unit="Units"
              rows={view.sales_weeks.map((w) => ({
                date: w.period_end,
                values: [w.units],
              }))}
              labels={["Recorded units"]}
            />
            <details className={css.disclosure}>
              <summary>Weekly quantities and calculation</summary>
              <p>
                Velocity = 7 × recorded units ÷ valid eligible observed
                store-days. Listed zero-selling days stay in the denominator.
                Missing sales remain missing; these are recorded sales, not
                unconstrained demand.
              </p>
              <div className={css.scroll}>
                <table className={css.table}>
                  <caption>Published weekly sales · exact scope</caption>
                  <thead>
                    <tr>
                      <th>Week ending</th>
                      <th>Units</th>
                      <th>Retail sales</th>
                      <th>Units/store/week</th>
                      <th>Observed days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.sales_weeks.map((w) => (
                      <tr key={w.period_end}>
                        <td>{day(w.period_end)}</td>
                        <td>{number(w.units)}</td>
                        <td>{money(w.dollars)}</td>
                        <td>{number(w.units_store_week, 1)}</td>
                        <td>
                          {w.sales_days}/{w.expected_days}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <div className={css.grid}>
            <RegionTable view={view} basis={basis} />
            <section className={css.panel}>
              <h2>Promotion performance</h2>
              <p className={css.notice}>
                Promotion analysis is unavailable in this publication. Dated
                campaigns, regular-price reference observations and funding
                terms are needed before lift or return can be assessed.
              </p>
            </section>
          </div>
        </>
      ) : (
        <>
          {tab === "Inventory" ? (
            <>
              <dl className={css.facts}>
                <Fact
                  title="Estimated unmet retail demand · next 28 days"
                  value={money(economic?.retail_exposure)}
                  note="Retail sales exposure; not recoverable brand revenue"
                />
                <Fact
                  title="Estimated unfulfilled units"
                  value={number(economic?.unfulfilled_units)}
                  note={`${economic?.ready_stores ?? 0}/${view.inventory.stores} stores support the projection`}
                />
                <Fact
                  title="Reported store inventory"
                  value={number(view.inventory.on_hand)}
                  note={`${view.inventory.known_stores}/${view.inventory.stores} stores have known stock`}
                />
              </dl>
              <section className={css.panel}>
                <TimeChart
                  key={`loss:${basis}`}
                  title="Estimated cumulative unmet retail sales"
                  unit="Retail dollars"
                  rows={rows.map((r) => ({
                    date: r.date,
                    values: [r.cumulative_retail_exposure],
                  }))}
                  labels={["Estimated retail exposure"]}
                  format={money}
                />
                <p className={css.muted}>
                  Valued at the published retailer price for each store. No
                  manufacturing, order execution or achievable recovery is
                  implied.
                </p>
              </section>
              <section className={css.panel}>
                <TimeChart
                  key={`stock:${basis}`}
                  title="Estimated store inventory"
                  unit="Units"
                  rows={rows.map((r) => ({
                    date: r.date,
                    values: [r.ending_units],
                  }))}
                  labels={["Estimated ending inventory"]}
                />
              </section>
            </>
          ) : (
            <>
              <section className={css.panel}>
                <h2>Total demand forecast</h2>
                <p className={css.muted}>
                  Issued with the selected publication · uses the same daily
                  demand as Inventory.
                </p>
                <TimeChart
                  key={`demand:${basis}`}
                  title="Estimated daily demand"
                  unit="Units/day"
                  rows={rows.map((r) => ({
                    date: r.date,
                    values: [r.demand_units],
                  }))}
                  labels={["Base demand"]}
                />
                <p className={css.notice}>
                  Driver components are unavailable. This publication does not
                  separate baseline, distribution, promotion, feature or
                  clearance effects.
                </p>
              </section>
            </>
          )}
          {!view.capabilities.inventory && (
            <p role="status" className={css.notice}>
              Inventory projections are not supported by this historical
              publication.
            </p>
          )}
          <section className={css.panel}>
            <h2>Projection evidence</h2>
            <p className={css.muted}>{view.projection_basis}</p>
            {economic?.first_shortage && (
              <p>
                First estimated unmet demand:{" "}
                <strong>{day(economic.first_shortage)}</strong>. This is a
                symptom date, not an order deadline.
              </p>
            )}
            <details className={css.disclosure}>
              <summary>Daily quantities and calculation</summary>
              <p>
                Inventory uses the published base path, dated receipts and
                existing missing-evidence rules. Entire-scope totals are
                unavailable when a required store lacks a projection. Firm and
                conditional paths are alternatives and must not be added.
              </p>
              <div className={css.scroll}>
                <table className={css.table}>
                  <caption>
                    Published 28-day path ·{" "}
                    {basis === "firm"
                      ? "firm supply only"
                      : "including eligible retailer plans"}
                  </caption>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Demand</th>
                      <th>Receipts</th>
                      <th>Ending stock</th>
                      <th>Unmet units</th>
                      <th>Cumulative retail exposure</th>
                      <th>Stores covered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.date}>
                        <td>{day(r.date)}</td>
                        <td>{number(r.demand_units)}</td>
                        <td>{number(r.inbound_units)}</td>
                        <td>{number(r.ending_units)}</td>
                        <td>{number(r.unfulfilled_units)}</td>
                        <td>{money(r.cumulative_retail_exposure)}</td>
                        <td>
                          {r.ready_stores}/{view.inventory.stores}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
    </>
  );
}
export function Fact({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className={css.fact}>
      <dt>{title}</dt>
      <dd>{value}</dd>
      <span className={css.muted}>{note}</span>
    </div>
  );
}
function RegionTable({ view, basis }: { view: ProductView; basis: Basis }) {
  return (
    <section className={css.panel}>
      <h2>Regional sales</h2>
      <p className={css.muted}>Latest complete week · all published regions</p>
      <div className={css.scroll}>
        <table className={css.table}>
          <caption>Choose a region to inspect its product sales</caption>
          <thead>
            <tr>
              <th>Region</th>
              <th>Units</th>
              <th>Units/store/week</th>
            </tr>
          </thead>
          <tbody>
            {view.regional_sales.map((r) => (
              <tr key={r.region}>
                <td>
                  <Link
                    href={detailUrl(
                      view.metric_release_id,
                      view.product_id,
                      "Sales",
                      r.region,
                      basis,
                    )}
                  >
                    {r.region}
                  </Link>
                </td>
                <td>{number(r.units)}</td>
                <td>
                  {number(r.units_store_week, 1)}
                  <span className={css.coverage}>
                    {r.sales_coverage == null
                      ? "Coverage unavailable"
                      : `${number(r.sales_coverage * 100, 1)}% sales coverage`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={css.notice}>
        A store map needs verified coordinates; none are published in this
        release.
      </p>
    </section>
  );
}
export function FindingEvidence({
  release,
  finding,
}: {
  release: string;
  finding: string;
}) {
  const [value, setValue] = useState<{ key: string; rows: Evidence[] } | null>(
    null,
  );
  const [error, setError] = useState("");
  const key = `${release}:${finding}`;
  useEffect(() => {
    const controller = new AbortController();
    allRows(
      "finding-evidence",
      evidenceSchema,
      release,
      { finding_id: finding },
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted) {
          setValue({ key, rows });
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Finding evidence is unavailable or failed validation.");
      });
    return () => controller.abort();
  }, [release, finding, key]);
  if (error) return <p role="alert">{error}</p>;
  if (value?.key !== key) return <p role="status">Loading finding evidence…</p>;
  return (
    <section className={css.panel}>
      <h2>Finding evidence</h2>
      <p className={css.muted}>
        Original member population · inventory capital, carrying cost and retail
        exposure remain separate.
      </p>
      <div className={css.scroll}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Store</th>
              <th>Units</th>
              <th>Retail exposure</th>
              <th>Inventory capital</th>
              <th>28-day carrying cost</th>
            </tr>
          </thead>
          <tbody>
            {value.rows.map((r) => (
              <tr key={r.evidence_id}>
                <td>{r.facts.store_name}</td>
                <td>{number(r.units)}</td>
                <td>{money(r.retail_exposure_amount)}</td>
                <td>{money(r.inventory_capital_amount)}</td>
                <td>{money(r.carrying_cost_28d_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
