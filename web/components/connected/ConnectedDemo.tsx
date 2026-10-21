"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  loadFindings,
  loadMetadata,
  supportsFindings,
  allRows,
} from "@/lib/connected/client";
import {
  periodSchema,
  type Finding,
  type Metadata,
  type Period,
} from "@/lib/connected/schema";
import FindingDetail from "./FindingDetail";
import {
  dateLabel,
  lenses,
  money,
  number,
  words,
} from "@/lib/connected/presentation";
import s from "./ConnectedDemo.module.css";

export default function ConnectedDemo({
  defaultRelease,
}: {
  defaultRelease?: string;
}) {
  const params = useSearchParams(),
    router = useRouter();
  const requestedRelease = params.get("release") ?? defaultRelease ?? null;
  const [loaded, setLoaded] = useState<{
    metadata: Metadata;
    findings: Finding[];
    requested: string | null;
  }>();
  const [error, setError] = useState<{
    requested: string | null;
    message: string;
  }>();
  const [search, setSearch] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void loadMetadata(requestedRelease, controller.signal)
      .then(async (metadata) => {
        if (!supportsFindings(metadata))
          throw new Error(
            "This historical release has no finding/evidence tables. Select a published v5 release; no mock data will be shown.",
          );
        const findings = await loadFindings(
          metadata.metric_release_id,
          controller.signal,
        );
        if (
          findings.some(
            (finding) =>
              !metadata.items.some(
                (item) => item.product_id === finding.product_id,
              ),
          )
        )
          throw new Error("Finding catalog identity mismatch.");
        if (!controller.signal.aborted)
          setLoaded({ metadata, findings, requested: requestedRelease });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError({
            requested: requestedRelease,
            message:
              cause instanceof Error
                ? cause.message
                : "Evidence could not be validated.",
          });
      });
    return () => controller.abort();
  }, [requestedRelease]);
  useEffect(() => {
    if (
      loaded &&
      loaded.requested === requestedRelease &&
      !params.get("release")
    ) {
      const query = new URLSearchParams(params.toString());
      query.set("release", loaded.metadata.metric_release_id);
      router.replace(`/signal?${query}`, { scroll: false });
    }
  }, [loaded, params, requestedRelease, router]);
  // Never show the preceding release while a different release is loading.
  const current = loaded?.requested === requestedRelease ? loaded : undefined;
  const failure =
    error?.requested === requestedRelease && !current ? error.message : null;
  const href = (changes: Record<string, string | null>) => {
    const query = new URLSearchParams(params.toString());
    if (current) query.set("release", current.metadata.metric_release_id);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null) query.delete(key);
      else query.set(key, value);
    }
    return `/signal?${query}`;
  };
  const home = href({
    view: null,
    finding: null,
    item: null,
    store: null,
    layer: null,
  });
  const openFinding = (finding: Finding) =>
    href({
      finding: finding.finding_id,
      item: null,
      view: null,
      store: null,
      layer: null,
    });
  const name = (finding: Finding) =>
    current?.metadata.items.find(
      (item) => item.product_id === finding.product_id,
    )?.product_name ?? finding.product_id;
  const selected = current?.findings.find(
    (finding) => finding.finding_id === params.get("finding"),
  );
  const lens = params.get("lens");
  const visible =
    current?.findings.filter(
      (finding) =>
        (!lens || lens === finding.promise) &&
        `${name(finding)} ${finding.title}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  const view = params.get("view");
  return (
    <div className={s.app}>
      <header className={s.topbar}>
        <Link className={s.brand} href={home} aria-label="Memento home">
          m<span>↻</span>
        </Link>
        <nav aria-label="Connected demo navigation" className={s.nav}>
          <Link href={home}>Overview</Link>
          <Link href={href({ view: "explore", finding: null, item: null })}>
            Explore
          </Link>
          <Link href={href({ view: "report", finding: null, item: null })}>
            Review
          </Link>
        </nav>
        <span className={s.tag}>Synthetic data · connected evidence</span>
        <Link
          href={href({ view: "explore", finding: null, item: null })}
          className={s.small}
        >
          Item metrics ↗
        </Link>
      </header>
      <main className={s.main}>
        {!current ? (
          <section className={s.state} aria-live="polite">
            <h1>
              {failure ? "Evidence unavailable" : "Loading the evidence…"}
            </h1>
            <p role={failure ? "alert" : "status"}>
              {failure ?? "Validating the selected release and its findings."}
            </p>
            {failure && (
              <p>
                Use a valid release in the URL and a backend serving that
                release. No dataset pointer has been changed.
              </p>
            )}
          </section>
        ) : (
          <>
            <div className={s.snapshot}>
              <span>
                Observed through {dateLabel(current.metadata.observation_date)}
              </span>
              <details>
                <summary>Release & definitions</summary>
                <code>{current.metadata.metric_release_id}</code>
                <p>
                  Analytical contract: {current.metadata.contract_version}.{" "}
                  {number(current.metadata.population)} store-item pairs; not a
                  unique-store count.
                </p>
                <p>
                  Order is the published stable order—not a priority
                  recommendation. No confidence probabilities or action benefits
                  are calculated.
                </p>
                {Object.entries(current.metadata.formulas).map(
                  ([key, value]) => (
                    <p key={key}>
                      <strong>{words(key)}:</strong> {value}
                    </p>
                  ),
                )}
              </details>
            </div>
            {params.get("finding") ? (
              selected ? (
                <FindingDetail
                  key={`${current.metadata.metric_release_id}:${selected.finding_id}`}
                  metadata={current.metadata}
                  finding={selected}
                  name={name(selected)}
                  back={home}
                />
              ) : (
                <section className={s.state}>
                  <h1>Finding not present in this release</h1>
                  <p>
                    A finding disappearing does not prove an action resolved it.
                  </p>
                  <Link href={home}>Back to overview</Link>
                </section>
              )
            ) : view === "explore" ? (
              <Explore
                key={current.metadata.metric_release_id}
                metadata={current.metadata}
                findings={current.findings}
                selectedId={params.get("item")}
                href={href}
                openFinding={openFinding}
              />
            ) : view === "report" ? (
              <section>
                <p className={s.eyebrow}>Evidence review</p>
                <h1>What we can say. What we can’t.</h1>
                <p className={s.lede}>
                  The three promises, grounded in this release. No invented lost
                  sales, peer benchmarks or measured decision results.
                </p>
                <div className={s.outcomes}>
                  {Object.entries(lenses).map(([promise, label]) => (
                    <article className={s.card} key={promise}>
                      <p className={s.eyebrow}>{promise}</p>
                      <h2>{label}</h2>
                      <p>
                        {
                          current.findings.filter(
                            (finding) => finding.promise === promise,
                          ).length
                        }{" "}
                        item/issue findings. Findings may overlap.
                      </p>
                      {current.findings
                        .filter((finding) => finding.promise === promise)
                        .map((finding) => (
                          <Link
                            className={s.reportRow}
                            key={finding.finding_id}
                            href={openFinding(finding)}
                          >
                            <strong>{name(finding)}</strong>
                            <span>{finding.title} →</span>
                          </Link>
                        ))}
                    </article>
                  ))}
                </div>
                <section className={s.card}>
                  <h2>Decision results</h2>
                  <p>
                    Not measured. Session notes are user-entered demo
                    annotations, not external approvals. Later inventory
                    recovery is an observed change—not attributable savings or
                    proof a decision worked.
                  </p>
                </section>
              </section>
            ) : (
              <section>
                <p className={s.eyebrow}>Your retail picture</p>
                <h1>
                  See the signal.
                  <br />
                  Know what’s behind it.
                </h1>
                <p className={s.lede}>
                  Reported stockouts, future coverage and inventory
                  exposure—with the evidence to review them.
                </p>
                <div className={s.outcomes}>
                  {Object.entries(lenses).map(([promise, label]) => (
                    <Link
                      key={promise}
                      className={s.card}
                      href={href({ lens: lens === promise ? null : promise })}
                      aria-current={lens === promise ? "true" : undefined}
                    >
                      <span className={s.eyebrow}>{promise}</span>
                      <h2>{label}</h2>
                      <strong className={s.count}>
                        {
                          current.findings.filter(
                            (finding) => finding.promise === promise,
                          ).length
                        }
                      </strong>
                      <span> item/issue findings →</span>
                    </Link>
                  ))}
                </div>
                <section className={s.card} aria-label="Published findings">
                  <div className={s.sectionHead}>
                    <div>
                      <h2>What deserves a closer look</h2>
                      <p>
                        Stable published order. Each row is one item and one
                        issue, not a ranked item.
                      </p>
                    </div>
                    <label className={s.search}>
                      Search items or findings
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search the evidence"
                      />
                    </label>
                  </div>
                  <div className={s.pills}>
                    <Link href={href({ lens: null })}>All findings</Link>
                    {Object.keys(lenses).map((promise) => (
                      <Link
                        key={promise}
                        href={href({ lens: promise })}
                        aria-current={lens === promise ? "true" : undefined}
                      >
                        {words(promise)}
                      </Link>
                    ))}
                  </div>
                  {!visible.length && (
                    <p>
                      {current.findings.length
                        ? "No findings match these filters."
                        : "No findings qualify in this release. This alone does not establish healthy inventory."}
                    </p>
                  )}
                  {visible.map((finding) => (
                    <Link
                      key={finding.finding_id}
                      href={openFinding(finding)}
                      className={s.findingRow}
                    >
                      <span
                        className={`${s.dot} ${finding.promise === "excess" ? s.orange : finding.promise === "expansion" ? s.blue : ""}`}
                      />
                      <div>
                        <strong>{name(finding)}</strong>
                        <p>{finding.title}</p>
                      </div>
                      <span>{number(finding.affected_store_count)} stores</span>
                      <span>
                        {finding.inventory_capital_amount !== null
                          ? `${money(finding.inventory_capital_amount)} capital`
                          : finding.retail_exposure_amount !== null
                            ? `${money(finding.retail_exposure_amount)} projected retail exposure`
                            : words(finding.units_basis)}
                      </span>
                      <span>→</span>
                    </Link>
                  ))}
                </section>
                <p className={s.footnote}>
                  Retail exposure, inventory capital and carrying cost are
                  different measures. They are not realized losses or savings,
                  and are not added into a portfolio “impact” total.
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Explore({
  metadata,
  findings,
  selectedId,
  href,
  openFinding,
}: {
  metadata: Metadata;
  findings: Finding[];
  selectedId: string | null;
  href: (changes: Record<string, string | null>) => string;
  openFinding: (finding: Finding) => string;
}) {
  const [search, setSearch] = useState("");
  const [periods, setPeriods] = useState<{ product: string; rows: Period[] }>();
  const [error, setError] = useState<{ product: string; message: string }>();
  const item = metadata.items.find((row) => row.product_id === selectedId);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void allRows(
      "periods",
      periodSchema,
      metadata.metric_release_id,
      { product_id: selectedId, grain: "item", period_kind: "week" },
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted)
          setPeriods({ product: selectedId, rows });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError({
            product: selectedId,
            message:
              "Completed-period metrics could not be loaded or validated.",
          });
      });
    return () => controller.abort();
  }, [selectedId, metadata.metric_release_id]);
  return (
    <section>
      <p className={s.eyebrow}>Explore</p>
      <h1>Every item. Not just the exceptions.</h1>
      <p className={s.lede}>
        Actual completed-week metrics remain accessible independently of
        findings.
      </p>
      <label className={s.search}>
        Search catalog
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className={s.catalog}>
        {metadata.items
          .filter((row) =>
            row.product_name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((row) => (
            <Link
              key={row.product_id}
              className={s.card}
              href={href({ item: row.product_id })}
            >
              <strong>{row.product_name}</strong>
              <p>
                {row.source_product_id} ·{" "}
                {row.company_item_id ?? "No company item code"}
              </p>
              <p>
                {
                  findings.filter(
                    (finding) => finding.product_id === row.product_id,
                  ).length
                }{" "}
                findings · not a health rating
              </p>
            </Link>
          ))}
      </div>
      {item && (
        <section className={s.card}>
          <h2>{item.product_name}</h2>
          {error?.product === item.product_id ? (
            <p role="alert">{error.message}</p>
          ) : periods?.product !== item.product_id ? (
            <p role="status">Loading completed weeks…</p>
          ) : (
            <div className={s.scroll}>
              <table>
                <caption>Completed weeks · actual fulfilled sales</caption>
                <thead>
                  <tr>
                    {[
                      "Week",
                      "Units",
                      "Retail sales",
                      "U/store/day",
                      "U/store/week",
                      "$/store/week",
                      "Sales coverage",
                      "Inventory coverage",
                      "Reported in stock",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.rows.map((row) => (
                    <tr key={row.period_start}>
                      <th>
                        {row.period_start} – {row.period_end}
                      </th>
                      <td>{number(row.units)}</td>
                      <td>{money(row.dollars)}</td>
                      <td>{number(row.store_day_rate)}</td>
                      <td>{number(row.units_store_week)}</td>
                      <td>{money(row.dollars_store_week)}</td>
                      <td>
                        {number(
                          row.sales_coverage == null
                            ? null
                            : row.sales_coverage * 100,
                        )}
                        %
                      </td>
                      <td>
                        {number(
                          row.inventory_coverage == null
                            ? null
                            : row.inventory_coverage * 100,
                        )}
                        %
                      </td>
                      <td>
                        {row.in_stock_rate == null
                          ? "Unavailable"
                          : `${number(row.in_stock_rate * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!periods.rows.length && <p>No completed weeks are available.</p>}
            </div>
          )}
          {findings
            .filter((finding) => finding.product_id === item.product_id)
            .map((finding) => (
              <Link
                key={finding.finding_id}
                href={openFinding(finding)}
                className={s.reportRow}
              >
                {finding.title} →
              </Link>
            ))}
        </section>
      )}
    </section>
  );
}
