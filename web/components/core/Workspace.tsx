"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { loadSummary } from "@/lib/core/client";
import type { Basis, Summary, Tab } from "@/lib/core/schema";
import { day, detailUrl } from "@/lib/core/format";
import css from "./Core.module.css";
import { Weekly } from "./Weekly";
import { Catalog, ProductPicker } from "./ProductPicker";
import { ProductContent } from "./ProductContent";

export default function Workspace() {
  return (
    <Suspense fallback={<p role="status">Loading retail workspace…</p>}>
      <Loader />
    </Suspense>
  );
}
function Loader() {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname();
  const requested = params.get("release");
  const [state, setState] = useState<{
    requested: string | null;
    data?: Summary;
    error?: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadSummary(requested, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ requested, data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            requested,
            error:
              "The selected publication is unavailable or failed validation.",
          });
      });
    return () => controller.abort();
  }, [requested, retry]);
  const data = state?.requested === requested ? state.data : undefined;
  const error = state?.requested === requested ? state.error : undefined;
  useEffect(() => {
    if (data && !requested) {
      const query = new URLSearchParams(window.location.search);
      query.set("release", data.metric_release_id);
      router.replace(`${path}?${query}`, { scroll: false });
    }
  }, [data, requested, router, path]);
  if (error)
    return (
      <div className={css.root}>
        <main className={css.state}>
          <h1>Report unavailable</h1>
          <p role="alert">{error}</p>
          <button className={css.button} onClick={() => setRetry((v) => v + 1)}>
            Retry publication
          </button>
          <Link className={css.textLink} href="/weekly">
            Open latest report
          </Link>
        </main>
      </div>
    );
  if (!data)
    return (
      <div className={css.root}>
        <main className={css.state} aria-busy="true">
          <h1>Memento Loop</h1>
          <p role="status">Loading your latest retail report…</p>
        </main>
      </div>
    );
  return <Connected summary={data} />;
}
function NavIcon({ detail = false }: { detail?: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
    >
      {detail ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
        </>
      ) : (
        <>
          <path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6" />
        </>
      )}
    </svg>
  );
}
function Connected({ summary: s }: { summary: Summary }) {
  const params = useSearchParams(),
    pathname = usePathname();
  const product = params.get("product") ?? s.products[0]?.product_id;
  const item = s.products.find((p) => p.product_id === product);
  const tab: Tab =
    params.get("tab") === "Inventory"
      ? "Inventory"
      : params.get("tab") === "Demand" || params.get("tab") === "Forecast"
        ? "Demand"
        : "Sales";
  const basis: Basis =
    params.get("basis") === "conditional" ? "conditional" : "firm";
  const region = params.get("region"),
    finding = params.get("finding");
  const isDetail = pathname === "/detail";
  return (
    <div className={css.root}>
      <header className={css.header}>
        <Link
          href={`/weekly?release=${s.metric_release_id}`}
          className={css.brand}
          aria-label="Craftmix · Weekly report"
          title="Craftmix"
        >
          <Image
            src="/craftmix-logo.png"
            alt="Craftmix"
            width={56}
            height={56}
            preload
          />
        </Link>
        <nav className={css.nav} aria-label="Main navigation">
          <Link
            href={`/weekly?release=${s.metric_release_id}`}
            aria-current={!isDetail ? "page" : undefined}
            title="Weekly"
          >
            <span className={css.navIcon}>
              <NavIcon />
            </span>
            Weekly
          </Link>
          <Link
            href={
              product
                ? detailUrl(
                    s.metric_release_id,
                    product,
                    tab,
                    region,
                    basis,
                    finding,
                  )
                : `/detail?release=${s.metric_release_id}`
            }
            aria-current={isDetail ? "page" : undefined}
            title="Detail"
          >
            <span className={css.navIcon}>
              <NavIcon detail />
            </span>
            Detail
          </Link>
        </nav>
        <Link
          href={`/signal?release=${s.metric_release_id}`}
          className={css.explore}
        >
          Explore evidence
        </Link>
      </header>
      <main className={css.main}>
        {isDetail ? (
          item ? (
            <>
              <ProductPicker
                summary={s}
                selected={item.product_id}
                tab={tab}
                region={region}
                basis={basis}
              />
              <nav className={css.tabs} aria-label="Item views">
                {(["Sales", "Inventory", "Demand"] as const).map((t) => (
                  <Link
                    key={t}
                    href={detailUrl(
                      s.metric_release_id,
                      product!,
                      t,
                      region,
                      basis,
                      finding,
                    )}
                    className={css.button}
                    aria-current={tab === t ? "page" : undefined}
                  >
                    {t}
                  </Link>
                ))}
              </nav>
              <ProductContent
                release={s.metric_release_id}
                product={item.product_id}
                region={region}
                finding={finding}
                tab={tab}
                basis={basis}
              />
            </>
          ) : (
            <section className={css.panel}>
              <h1>
                {product ? "Product unavailable" : "No products published"}
              </h1>
              <p className={css.notice}>
                Choose a product in this publication to open its sales and
                inventory evidence.
              </p>
              <Catalog summary={s} tab={tab} region={region} basis={basis} />
            </section>
          )
        ) : (
          <Weekly summary={s} />
        )}
        <details className={css.disclosure}>
          <summary>Publication and calculation evidence</summary>
          <dl className={css.lineage}>
            <dt>Publication</dt>
            <dd>{s.metric_release_id}</dd>
            <dt>Metric contract</dt>
            <dd>{s.metric_version}</dd>
            <dt>Publication issued</dt>
            <dd>{s.issued_at}</dd>
            <dt>Observation cutoff</dt>
            <dd>{day(s.observation_date)}</dd>
            <dt>Sales basis</dt>
            <dd>{s.sales_basis}</dd>
            <dt>View contract</dt>
            <dd>{s.view_version}</dd>
          </dl>
        </details>
      </main>
    </div>
  );
}
