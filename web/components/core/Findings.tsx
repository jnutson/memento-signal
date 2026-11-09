"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Summary } from "@/lib/core/schema";
import { day, detailUrl, money } from "@/lib/core/format";
import { loadFindings } from "@/lib/connected/client";
import type { Finding } from "@/lib/connected/schema";
import { findingCopy } from "@/lib/reimagined/data";
import { IconButton } from "./IconButton";
import { ProductContent } from "./ProductContent";
import css from "./Core.module.css";
export function Findings({
  release,
  products,
}: {
  release: string;
  products: Summary["products"];
}) {
  const [state, setState] = useState<{
    release: string;
    rows?: Finding[];
    error?: string;
  } | null>(null);
  const [investigation, setInvestigation] = useState<Finding | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadFindings(release, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setState({ release, rows });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            release,
            error: "Findings are unavailable or failed validation.",
          });
      });
    return () => controller.abort();
  }, [release]);
  useEffect(() => {
    if (investigation) dialog.current?.showModal();
  }, [investigation]);
  const rows = state?.release === release ? state.rows : undefined;
  return (
    <section className={css.findings} aria-label="Published findings">
      <div>
        <h2>What needs your attention</h2>
        <p className={css.muted}>
          Published findings in source order. Financial measures have different
          bases; these cards are not a new financial ranking.
        </p>
      </div>
      {state?.error && state.release === release && (
        <p role="alert">{state.error}</p>
      )}
      {!rows && !state?.error && <p role="status">Loading findings…</p>}
      {rows?.length === 0 && (
        <p className={css.notice}>
          No eligible findings were published. Explore product sales and
          inventory for the same release.
        </p>
      )}
      {rows?.slice(0, 6).map((source) => {
        const f = findingCopy(source);
        return (
          <article key={f.finding_id} className={`${css.panel} ${css.finding}`}>
            <p className={css.eyebrow}>
              {products.find((p) => p.product_id === f.product_id)
                ?.product_name ?? f.product_id}{" "}
              · {f.affected_store_count}{" "}
              {f.affected_store_count === 1 ? "store" : "stores"}
            </p>
            <h3>{f.title}</h3>
            <p>{f.interpretation}</p>
            <ul>
              {f.retail_exposure_amount !== null && (
                <li>
                  {money(f.retail_exposure_amount)} published retail exposure
                  estimate
                </li>
              )}
              {f.inventory_capital_amount !== null && (
                <li>
                  {money(f.inventory_capital_amount)} inventory capital exposed;
                  separate from {money(f.carrying_cost_28d_amount)} carrying
                  cost
                </li>
              )}
              {f.first_event_date && (
                <li>
                  First event: {day(f.first_event_date)}; not an order deadline
                </li>
              )}
            </ul>
            {f.promise === "availability" ? (
              <IconButton
                label="Investigate"
                icon="arrow"
                className={css.investigate}
                onClick={() => setInvestigation(f)}
              />
            ) : (
              <Link
                className={css.textLink}
                href={detailUrl(
                  release,
                  f.product_id,
                  f.promise === "expansion" ? "Sales" : "Inventory",
                  null,
                  "firm",
                  f.finding_id,
                )}
              >
                Open evidence →
              </Link>
            )}
            <details className={css.disclosure}>
              <summary>Finding basis and limitations</summary>
              <p>
                {f.supply_basis} · {f.units_basis}
              </p>
              <ul>
                {[...f.limitations, ...f.missing_evidence].map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              <Link
                className={css.textLink}
                href={`/signal?${new URLSearchParams({ release, finding: f.finding_id })}`}
              >
                Explore original finding
              </Link>
            </details>
          </article>
        );
      })}
      {rows && rows.length > 6 && (
        <Link className={css.textLink} href={`/signal?release=${release}`}>
          Explore all {rows.length} findings →
        </Link>
      )}
      <dialog
        ref={dialog}
        className={css.dialog}
        aria-label="Inventory investigation"
        onClose={() => setInvestigation(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        {investigation && (
          <div className={css.dialogBody}>
            <div className={css.close}>
              <div>
                <p className={css.eyebrow}>Inventory investigation</p>
                <h2>
                  {
                    products.find(
                      (p) => p.product_id === investigation.product_id,
                    )?.product_name
                  }
                </h2>
                <p>{investigation.title}</p>
              </div>
              <IconButton
                label="Close inventory investigation"
                icon="close"
                onClick={() => dialog.current?.close()}
              />
            </div>
            <ProductContent
              release={release}
              product={investigation.product_id}
              region={null}
              finding={investigation.finding_id}
              tab="Inventory"
              basis="firm"
            />
          </div>
        )}
      </dialog>
    </section>
  );
}
