"use client";
import { useState } from "react";
import Link from "next/link";
import type { Summary } from "@/lib/core/schema";
import { day, detailUrl, money, number, percent } from "@/lib/core/format";
import { Segmented } from "./Controls";
import { Findings } from "./Findings";
import css from "./Core.module.css";
export function Weekly({ summary: s }: { summary: Summary }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"units" | "name">("units");
  const products = s.products
    .filter((p) =>
      `${p.product_name} ${p.company_item_id ?? ""} ${p.source_product_id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .toSorted((a, b) =>
      sort === "name"
        ? a.product_name.localeCompare(b.product_name)
        : (b.current?.units ?? -Infinity) - (a.current?.units ?? -Infinity) ||
          a.product_id.localeCompare(b.product_id),
    );
  return (
    <>
      <section
        className={`${css.panel} ${css.hero}`}
        aria-label="Weekly report summary"
      >
        <p className={css.eyebrow}>
          Weekly report · data through {day(s.observation_date)}
        </p>
        <h1>
          {day(s.week_start)}–{day(s.week_end)}
        </h1>
        <p className={css.headline}>
          <strong>{number(s.current.units)} units recorded</strong> across{" "}
          {number(s.products.length)} products and {number(s.store_count)}{" "}
          currently eligible retail stores. Recorded retailer sales were{" "}
          <strong>{money(s.current.retail_sales)}</strong>.
        </p>
        <p>
          {s.units_change_pct !== null
            ? `${percent(s.units_change_pct)} units versus the prior week.`
            : "Week-over-week growth is unavailable because matched complete sales coverage or a positive prior total is missing."}
        </p>
        {!s.current.complete && (
          <p className={css.notice}>
            Partial sales coverage: {number(s.current.sales_days)} of{" "}
            {number(s.current.expected_days)} expected store-item days observed;{" "}
            {s.current.covered_products} of {s.products.length} products have
            this week’s records. Totals describe available records; unit shares
            and growth are withheld.
          </p>
        )}
      </section>
      <section className={css.panel} aria-label="Sales by SKU">
        <div className={css.toolbar}>
          <h2>Sales by SKU</h2>
          <Segmented
            label="Product sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: "units", label: "Units sold" },
              { value: "name", label: "Product name" },
            ]}
          />
        </div>
        <label className={css.muted} htmlFor="weekly-product-search">
          Find a product
        </label>
        <br />
        <input
          id="weekly-product-search"
          className={css.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products or item codes"
          type="search"
        />
        <div className={css.scroll}>
          <table className={css.table}>
            <caption>
              {day(s.week_start)}–{day(s.week_end)} · recorded retailer sales
            </caption>
            <thead>
              <tr>
                <th>Product</th>
                <th>Units sold</th>
                <th>Retail sales ($)</th>
                <th>Units/store/week</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.product_id}>
                  <td>
                    <Link href={detailUrl(s.metric_release_id, p.product_id)}>
                      {p.product_name}
                    </Link>
                    <span className={css.coverage}>
                      {p.company_item_id ?? p.source_product_id}
                    </span>
                  </td>
                  <td>{number(p.current?.units)}</td>
                  <td>{money(p.current?.dollars)}</td>
                  <td>
                    {number(p.current?.units_store_week, 1)}
                    {p.current &&
                      p.current.sales_days !== p.current.expected_days && (
                        <span className={css.coverage}>
                          Partial sales coverage
                        </span>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!products.length && (
          <p role="status" className={css.notice}>
            No products match your search.
          </p>
        )}
        <details className={css.disclosure}>
          <summary>Sales definitions</summary>
          <p>
            {s.sales_basis} The common reporting week is Saturday–Friday.
            Reporting dates are never moved to today. Products without
            current-period evidence remain unavailable.
          </p>
        </details>
      </section>
      {s.capabilities.findings && (
        <Findings release={s.metric_release_id} products={s.products} />
      )}
    </>
  );
}
