"use client";
import { useEffect, useState } from "react";
import { loadStores } from "@/lib/core/client";
import type { StorePage } from "@/lib/core/schema";
import { number } from "@/lib/core/format";
import css from "./Core.module.css";

export function StoreTable({
  release,
  product,
  region,
}: {
  release: string;
  product: string;
  region: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={css.panel}>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>Store inventory visibility</summary>
        {open && (
          <StoreRows
            key={`${release}:${product}:${region}`}
            release={release}
            product={product}
            region={region}
          />
        )}
      </details>
    </section>
  );
}
function StoreRows({
  release,
  product,
  region,
}: {
  release: string;
  product: string;
  region: string | null;
}) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: StorePage;
    error?: string;
  } | null>(null);
  const key = `${search}:${offset}`;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      loadStores(release, product, region, search, offset, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setResult({ key, data });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResult({
              key,
              error: "Store visibility is unavailable or failed validation.",
            });
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [release, product, region, search, offset, key, retry]);
  const data = result?.key === key ? result.data : undefined;
  const states: Record<string, string> = {
    reported_zero_on_hand: "Reported zero stock",
    positive_reported_inventory: "Positive reported stock",
    unknown_inventory: "Inventory unavailable",
    not_applicable: "Not eligible",
  };
  return (
    <>
      <p className={css.notice}>
        Reported inventory is visibility, not confirmation of shelf availability
        or authority to allocate retailer stock.
      </p>
      <label htmlFor="store-search" className={css.muted}>
        Find a store
      </label>
      <br />
      <input
        id="store-search"
        type="search"
        maxLength={120}
        className={css.search}
        placeholder="Store name or code"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOffset(0);
        }}
      />
      {result?.key === key && result.error && (
        <p role="alert">
          {result.error}{" "}
          <button className={css.button} onClick={() => setRetry((v) => v + 1)}>
            Retry stores
          </button>
        </p>
      )}
      {!data && !result?.error && (
        <p role="status" className={css.notice}>
          Loading store visibility…
        </p>
      )}
      {data && (
        <>
          <div className={css.scroll}>
            <table className={css.table}>
              <caption>
                {data.total} matching stores · page{" "}
                {Math.floor(offset / 25) + 1}
              </caption>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Region</th>
                  <th>Reported stock</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.location_id}>
                    <td>
                      {r.location_name}
                      <span className={css.coverage}>
                        {r.source_location_id}
                      </span>
                    </td>
                    <td>{r.region}</td>
                    <td>{number(r.on_hand)}</td>
                    <td>{states[r.current_state] ?? "Unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total === 0 && (
            <p role="status" className={css.notice}>
              No stores match your search.
            </p>
          )}
          <div className={css.toolbar}>
            <button
              className={css.button}
              disabled={offset === 0}
              onClick={() => setOffset((v) => Math.max(0, v - 25))}
            >
              Previous stores
            </button>
            <button
              className={css.button}
              disabled={offset + data.rows.length >= data.total}
              onClick={() => setOffset((v) => v + 25)}
            >
              Next stores
            </button>
          </div>
        </>
      )}
    </>
  );
}
