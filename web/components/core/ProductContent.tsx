"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Basis, ProductView, Tab } from "@/lib/core/schema";
import { detailUrl } from "@/lib/core/format";
import { loadProduct } from "@/lib/core/client";
import { ProductPanels, FindingEvidence } from "./ProductPanels";
import { StoreTable } from "./StoreTable";
import css from "./Core.module.css";
export function ProductContent({
  release,
  product,
  region,
  finding,
  tab,
  basis,
}: {
  release: string;
  product: string;
  region: string | null;
  finding: string | null;
  tab: Tab;
  basis: Basis;
}) {
  const [result, setResult] = useState<{
    key: string;
    data?: ProductView;
    error?: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = `${release}:${product}:${region}:${finding}`;
  useEffect(() => {
    const controller = new AbortController();
    loadProduct(release, product, region, finding, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            error:
              e instanceof Error ? e.message : "Product evidence unavailable.",
          });
      });
    return () => controller.abort();
  }, [release, product, region, finding, key, retry]);
  if (result?.key === key && result.error)
    return (
      <section className={css.panel}>
        <p role="alert">{result.error}</p>
        <button className={css.button} onClick={() => setRetry((v) => v + 1)}>
          Retry evidence
        </button>{" "}
        <Link
          className={css.textLink}
          href={detailUrl(release, product, tab, null, basis)}
        >
          Clear unavailable scope
        </Link>
      </section>
    );
  const view = result?.key === key ? result.data : undefined;
  if (!view)
    return (
      <section className={css.panel} aria-busy="true">
        <p role="status">Loading product evidence…</p>
      </section>
    );
  return (
    <>
      <div className={css.toolbar}>
        <RegionControl
          regions={view.regions}
          selected={region}
          release={release}
          product={product}
          tab={tab}
          basis={basis}
          finding={finding}
        />
        {tab !== "Sales" && (
          <div>
            <span className={css.muted}>Supply basis</span>
            <div className={css.tabs} aria-label="Supply basis">
              <Link
                className={css.button}
                aria-current={basis === "firm" ? "page" : undefined}
                href={detailUrl(release, product, tab, region, "firm", finding)}
              >
                Firm receipts only
              </Link>
              {view.capabilities.conditional_supply && (
                <Link
                  className={css.button}
                  aria-current={basis === "conditional" ? "page" : undefined}
                  href={detailUrl(
                    release,
                    product,
                    tab,
                    region,
                    "conditional",
                    finding,
                  )}
                >
                  Include retailer plans
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
      {finding && (
        <p className={css.notice}>
          Investigating the selected finding’s store population.{" "}
          <Link
            className={css.textLink}
            href={detailUrl(release, product, tab, region, basis)}
          >
            Show all product stores
          </Link>
        </p>
      )}
      {tab !== "Sales" && basis === "conditional" && (
        <p className={css.notice}>
          Eligible retailer plans are conditional. Their arrival and execution
          require retailer confirmation.
        </p>
      )}
      <ProductPanels key={tab} view={view} tab={tab} basis={basis} />
      {tab === "Inventory" && !finding && (
        <StoreTable release={release} product={product} region={region} />
      )}
      {finding && <FindingEvidence release={release} finding={finding} />}
    </>
  );
}
function RegionControl({
  regions,
  selected,
  release,
  product,
  tab,
  basis,
  finding,
}: {
  regions: string[];
  selected: string | null;
  release: string;
  product: string;
  tab: Tab;
  basis: Basis;
  finding: string | null;
}) {
  const [search, setSearch] = useState("");
  return (
    <div>
      <span className={css.muted}>Region</span>
      {regions.length > 5 && (
        <>
          <br />
          <input
            aria-label="Find region"
            type="search"
            className={css.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search regions"
          />
        </>
      )}
      <nav className={css.tabs} aria-label="Region">
        <Link
          className={css.button}
          aria-current={!selected ? "page" : undefined}
          href={detailUrl(release, product, tab, null, basis, finding)}
        >
          All regions
        </Link>
        {regions
          .filter((r) => r.toLowerCase().includes(search.toLowerCase()))
          .slice(0, regions.length > 5 ? 12 : 5)
          .map((r) => (
            <Link
              key={r}
              className={css.button}
              aria-current={r === selected ? "page" : undefined}
              href={detailUrl(release, product, tab, r, basis, finding)}
            >
              {r}
            </Link>
          ))}
      </nav>
    </div>
  );
}
