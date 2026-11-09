"use client";

import { useEffect, useState } from "react";
import { allRows } from "@/lib/connected/client";
import {
  dailySchema,
  projectionSchema,
  type Daily,
  type Evidence,
  type Metadata,
  type Projection,
} from "@/lib/connected/schema";
import { number } from "@/lib/connected/presentation";
import s from "./ConnectedDemo.module.css";

export default function StoreTrace({
  metadata,
  evidence,
}: {
  metadata: Metadata;
  evidence: Evidence;
}) {
  const [data, setData] = useState<{
    daily: Daily[];
    firm: Projection[];
    conditional: Projection[];
  }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    const filters = {
      product_id: evidence.product_id,
      scope_id: evidence.location_id,
    };
    void Promise.all([
      allRows(
        "daily",
        dailySchema,
        metadata.metric_release_id,
        filters,
        controller.signal,
      ),
      allRows(
        "projection",
        projectionSchema,
        metadata.metric_release_id,
        filters,
        controller.signal,
      ),
      allRows(
        "expected-projection",
        projectionSchema,
        metadata.metric_release_id,
        filters,
        controller.signal,
      ),
    ])
      .then(([daily, firm, conditional]) => {
        if (
          [...daily, ...firm, ...conditional].some(
            (row) =>
              row.product_id !== evidence.product_id ||
              row.location_id !== evidence.location_id,
          )
        )
          throw new Error();
        const baseFirm = firm.filter((row) => row.path === "base");
        const baseConditional = conditional.filter(
          (row) => row.path === "base",
        );
        const expectedByDate = new Map(
          baseConditional.map((row) => [row.projection_date, row]),
        );
        if (
          new Set(baseFirm.map((row) => row.projection_date)).size !==
            baseFirm.length ||
          expectedByDate.size !== baseConditional.length ||
          (baseFirm.length > 0 && baseFirm.length !== 28) ||
          (baseConditional.length > 0 &&
            (baseConditional.length !== baseFirm.length ||
              baseFirm.some(
                (row) =>
                  expectedByDate.get(row.projection_date)?.demand_units !==
                  row.demand_units,
              )))
        )
          throw new Error("Mismatched supply trace population.");
        if (!controller.signal.aborted)
          setData({
            daily,
            firm: baseFirm,
            conditional: baseConditional,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Store history/projection could not be loaded completely or validated. No synthetic curve has been substituted.",
          );
      });
    return () => controller.abort();
  }, [metadata.metric_release_id, evidence]);
  if (error) return <p role="alert">{error}</p>;
  if (!data)
    return (
      <p role="status">
        Loading this store’s actual history and supply traces…
      </p>
    );
  const firm = [...data.firm].sort((a, b) =>
    a.projection_date.localeCompare(b.projection_date),
  );
  const conditional = new Map(
    data.conditional.map((row) => [row.projection_date, row]),
  );
  const maximum = Math.max(
    1,
    ...firm.map((row) => row.ending_units),
    ...data.conditional.map((row) => row.ending_units),
  );
  const points = (rows: Projection[]) =>
    rows
      .map(
        (row) =>
          `${20 + (firm.findIndex((day) => day.projection_date === row.projection_date) / Math.max(1, firm.length - 1)) * 760},${170 - (row.ending_units / maximum) * 145}`,
      )
      .join(" ");
  return (
    <div className={s.trace}>
      <h3>Next 28 days · projected ending units</h3>
      <p>
        Single store,{" "}
        {metadata.configuration.demand_model === "retailer_baseline"
          ? "unchanged base Walmart forecast demand"
          : "published base demand (not an unchanged Walmart forecast claim)"}
        . Blue: firm supply. Dashed orange: firm plus eligible planned supply,
        conditional on placement and delivery. No action-effect overlay or
        arrival-probability band.
      </p>
      {firm.length ? (
        <>
          <svg
            className={s.chart}
            viewBox="0 0 800 200"
            role="img"
            aria-label="Daily projected ending inventory for firm supply and conditional planned supply; exact values follow in the table"
          >
            <line x1="20" y1="170" x2="780" y2="170" stroke="#d6d6d2" />
            <text x="20" y="15">
              {number(maximum)} units
            </text>
            <polyline
              fill="none"
              stroke="#0a7aff"
              strokeWidth="3"
              points={points(firm)}
            />
            {data.conditional.length === firm.length && (
              <polyline
                fill="none"
                stroke="#d97706"
                strokeWidth="3"
                strokeDasharray="7 5"
                points={points(
                  firm.map((row) => conditional.get(row.projection_date)!),
                )}
              />
            )}
            <text x="20" y="195">
              {firm[0].projection_date}
            </text>
            <text x="690" y="195">
              {firm.at(-1)?.projection_date}
            </text>
          </svg>
          <div className={s.scroll}>
            <table>
              <caption>Daily projection · units, not dollars</caption>
              <thead>
                <tr>
                  {[
                    "Date",
                    "Forecast demand",
                    "Firm receipts",
                    "Firm ending",
                    "Firm unmet",
                    "Conditional receipts",
                    "Conditional ending",
                    "Conditional unmet",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {firm.map((row) => {
                  const expected = conditional.get(row.projection_date);
                  return (
                    <tr key={row.projection_date}>
                      <th>{row.projection_date}</th>
                      <td>{number(row.demand_units)}</td>
                      <td>{number(row.inbound_units)}</td>
                      <td>{number(row.ending_units)}</td>
                      <td>{number(row.unfulfilled_units)}</td>
                      <td>{number(expected?.inbound_units)}</td>
                      <td>{number(expected?.ending_units)}</td>
                      <td>{number(expected?.unfulfilled_units)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>
          No complete firm projection exists for this member. This is not zero
          demand or healthy coverage.
        </p>
      )}
      <details>
        <summary>Actual store-day history</summary>
        <p>
          Missing observations remain unavailable. Reported inventory is not a
          shelf audit.
        </p>
        <div className={s.scroll}>
          <table>
            <caption>Actual observations · newest first</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fulfilled units</th>
                <th>Retail sales USD</th>
                <th>Reported on hand</th>
                <th>Eligible</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((row) => (
                <tr key={row.business_date}>
                  <th>{row.business_date}</th>
                  <td>{row.sales_valid ? number(row.units) : "Unavailable"}</td>
                  <td>
                    {row.sales_valid ? number(row.dollars) : "Unavailable"}
                  </td>
                  <td>
                    {row.inventory_valid ? number(row.on_hand) : "Unavailable"}
                  </td>
                  <td>{row.eligible ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
