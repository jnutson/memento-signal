"use client";
import { useState } from "react";
import Link from "next/link";
import type { Basis, Summary, Tab } from "@/lib/core/schema";
import { day, detailUrl } from "@/lib/core/format";
import css from "./Core.module.css";
export function Catalog({
  summary: s,
  selected,
  tab,
  region,
  basis,
}: {
  summary: Summary;
  selected?: string;
  tab: Tab;
  region: string | null;
  basis: Basis;
}) {
  const [search, setSearch] = useState("");
  const filtered = s.products.filter((p) =>
    `${p.product_name} ${p.company_item_id ?? ""} ${p.source_product_id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <label className={css.muted} htmlFor="detail-product-search">
        Find a product
      </label>
      <br />
      <input
        id="detail-product-search"
        type="search"
        className={css.search}
        placeholder="Search products or item codes"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className={css.searchList} aria-label="Product search results">
        {filtered.slice(0, 30).map((p) => (
          <Link
            key={p.product_id}
            href={detailUrl(
              s.metric_release_id,
              p.product_id,
              tab,
              region,
              basis,
            )}
            aria-current={p.product_id === selected ? "true" : undefined}
          >
            {p.product_name}{" "}
            <span className={css.muted}>{p.company_item_id}</span>
          </Link>
        ))}
      </div>
      {!filtered.length && (
        <p role="status" className={css.notice}>
          No products match your search.
        </p>
      )}
      {filtered.length > 30 && (
        <p className={css.muted}>
          Showing 30 of {filtered.length} products. Refine the search to find
          another item.
        </p>
      )}
    </>
  );
}
export function ProductPicker({
  summary: s,
  selected,
  tab,
  region,
  basis,
}: {
  summary: Summary;
  selected: string;
  tab: Tab;
  region: string | null;
  basis: Basis;
}) {
  const index = s.products.findIndex((p) => p.product_id === selected);
  const previous =
      s.products[(index - 1 + s.products.length) % s.products.length],
    next = s.products[(index + 1) % s.products.length];
  return (
    <section className={css.panel}>
      <div className={css.itemTitle}>
        <div>
          <p className={css.eyebrow}>
            Product detail · data through {day(s.observation_date)}
          </p>
          <h1>{s.products[index].product_name}</h1>
        </div>
        <nav className={css.arrows} aria-label="Product navigation">
          <Link
            className={css.button}
            aria-label="Previous product"
            title="Previous product"
            href={detailUrl(
              s.metric_release_id,
              previous.product_id,
              tab,
              region,
              basis,
            )}
          >
            ←
          </Link>
          <span className={css.muted}>
            {index + 1}/{s.products.length}
          </span>
          <Link
            className={css.button}
            aria-label="Next product"
            title="Next product"
            href={detailUrl(
              s.metric_release_id,
              next.product_id,
              tab,
              region,
              basis,
            )}
          >
            →
          </Link>
        </nav>
      </div>
      <details className={css.disclosure}>
        <summary>Find another product</summary>
        <Catalog
          summary={s}
          selected={selected}
          tab={tab}
          region={region}
          basis={basis}
        />
      </details>
    </section>
  );
}
