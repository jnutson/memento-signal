"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { allRows, loadReview } from "@/lib/connected/client";
import {
  contextSchema,
  evidenceSchema,
  type Evidence,
  type Finding,
  type Metadata,
  type Review,
} from "@/lib/connected/schema";
import { downloadEvidence } from "@/lib/connected/export";
import {
  dateLabel,
  lenses,
  money,
  number,
  words,
} from "@/lib/connected/presentation";
import StoreTrace from "./StoreTrace";
import s from "./ConnectedDemo.module.css";

const noteSchema = z.object({
  option: z.string(),
  status: z.enum([
    "Proposed",
    "Reviewed",
    "Approved (demo note)",
    "Marked complete (demo note)",
    "Declined (demo note)",
  ]),
  text: z.string().max(2000),
});
type Note = z.infer<typeof noteSchema>;
const emptyNote: Note = { option: "", status: "Proposed", text: "" };
const subscribe = (callback: () => void) => {
  window.addEventListener("memento-review-note", callback);
  return () => window.removeEventListener("memento-review-note", callback);
};

export default function FindingDetail({
  metadata,
  finding,
  name,
  back,
}: {
  metadata: Metadata;
  finding: Finding;
  name: string;
  back: string;
}) {
  const params = useSearchParams(),
    router = useRouter();
  const [data, setData] = useState<{ evidence: Evidence[]; review: Review }>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [draft, setNote] = useState<Note>();
  const key = `memento-review:${metadata.metric_release_id}:${finding.finding_id}`;
  const rawNote = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const saved = (() => {
    try {
      return rawNote ? noteSchema.parse(JSON.parse(rawNote)) : undefined;
    } catch {
      return undefined;
    }
  })();
  const note = draft ?? saved ?? emptyNote;
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      allRows(
        "finding-evidence",
        evidenceSchema,
        metadata.metric_release_id,
        { finding_id: finding.finding_id },
        controller.signal,
      ),
      loadReview(
        metadata.metric_release_id,
        finding.finding_id,
        controller.signal,
      ),
    ])
      .then(([evidence, review]) => {
        if (
          evidence.length !== finding.affected_store_count ||
          new Set(evidence.map((row) => row.location_id)).size !==
            evidence.length ||
          evidence.some(
            (row) =>
              row.finding_id !== finding.finding_id ||
              row.product_id !== finding.product_id ||
              row.finding_code !== finding.finding_code,
          )
        )
          throw new Error(
            "Member evidence does not reconcile to the selected finding.",
          );
        if (!controller.signal.aborted) setData({ evidence, review });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Evidence could not be validated.",
          );
      });
    return () => controller.abort();
  }, [metadata.metric_release_id, finding]);
  const navigate = (layer: string, store?: string) => {
    const query = new URLSearchParams(params.toString());
    query.set("layer", layer);
    if (store) query.set("store", store);
    router.push(`/signal?${query}`, { scroll: false });
  };
  const layer = params.get("layer") ?? "situation";
  const storeId = params.get("store");
  const selected =
    data?.evidence.find((row) => row.location_id === storeId) ??
    (!storeId ? data?.evidence[0] : undefined);
  const filtered =
    data?.evidence.filter((row) =>
      `${row.facts.store_name} ${row.facts.region} ${row.location_id}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];
  const context = (() => {
    try {
      return contextSchema.parse(JSON.parse(finding.context_json));
    } catch {
      return null;
    }
  })();
  return (
    <section>
      <Link href={back} className={s.back}>
        ← All findings
      </Link>
      <p className={s.eyebrow}>{lenses[finding.promise]}</p>
      <h1>{name}</h1>
      <p className={s.lede}>{finding.title}</p>
      <div className={s.tabs} aria-label="Finding sections">
        {[
          ["situation", "01 Understand the situation"],
          ["decision", "02 Choose your review"],
          ["evidence", "03 Look under the hood"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={layer === value}
            onClick={() => navigate(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <section className={s.card}>
          <h2>Evidence unavailable</h2>
          <p role="alert">{error}</p>
          <p>No preview values or partial export are substituted.</p>
        </section>
      ) : !data ? (
        <p className={s.card} role="status">
          Loading every affected store and its review context…
        </p>
      ) : (
        <>
          <div className={s.metrics}>
            <article className={s.card}>
              <span>Affected stores</span>
              <strong>
                {number(finding.affected_store_count)} /{" "}
                {number(finding.eligible_store_count)}
              </strong>
              <small>
                Currently eligible store-item population for this item
              </small>
            </article>
            <article className={s.card}>
              <span>
                {finding.promise === "expansion"
                  ? "Incremental fulfilled units"
                  : finding.inventory_capital_amount !== null ||
                      finding.promise === "excess"
                    ? "Inventory capital exposure"
                    : "Projected retail exposure"}
              </span>
              <strong>
                {finding.promise === "expansion"
                  ? number(finding.units)
                  : money(
                      finding.promise === "excess"
                        ? finding.inventory_capital_amount
                        : finding.retail_exposure_amount,
                    )}
              </strong>
              <small>
                {finding.promise === "expansion"
                  ? "Compared with the preceding internal baseline · not causal lift"
                  : `${words(finding.supply_basis)} · not realized loss or savings`}
              </small>
            </article>
            <article className={s.card}>
              <span>
                {finding.promise === "excess"
                  ? "Projection horizon date"
                  : "First evidence / projected symptom date"}
              </span>
              <strong>{dateLabel(finding.first_event_date)}</strong>
              <small>Not a verified feasible-action deadline</small>
            </article>
          </div>
          {layer === "situation" && (
            <>
              <article className={`${s.card} ${s.story}`}>
                <p className={s.eyebrow}>{data.review.cue}</p>
                <h2>What the evidence says</h2>
                <p>{finding.interpretation}</p>
                <p className={s.footnote}>{data.review.cue_basis}</p>
                <button
                  className={s.primary}
                  onClick={() => navigate("decision")}
                >
                  Review the next questions →
                </button>
              </article>
              <div className={s.twoCol}>
                <article className={s.card}>
                  <h2>The basis</h2>
                  <dl>
                    <dt>Quantity</dt>
                    <dd>
                      {number(finding.units)} · {words(finding.units_basis)}
                    </dd>
                    <dt>Source plan review date</dt>
                    <dd>
                      {dateLabel(finding.earliest_plan_review_date)} · source
                      date, not an action deadline
                    </dd>
                    <dt>Carrying cost, 28 days</dt>
                    <dd>
                      {money(finding.carrying_cost_28d_amount)} · requires an
                      approved rate
                    </dd>
                    {context && finding.promise === "excess" && (
                      <>
                        <dt>Cover target</dt>
                        <dd>
                          {context.target_cover_days} days, evaluated against
                          projected ending stock—not current on-hand alone
                        </dd>
                      </>
                    )}
                  </dl>
                </article>
                <article className={s.card}>
                  <h2>What remains unverified</h2>
                  <ul>
                    {finding.missing_evidence.map((value) => (
                      <li key={value}>{words(value)}</li>
                    ))}
                  </ul>
                  {!finding.missing_evidence.length && (
                    <p>
                      No missing evidence is declared for this rule. This is not
                      proof that an action is feasible.
                    </p>
                  )}
                </article>
              </div>
              <article className={s.card}>
                <h2>Limits of this finding</h2>
                <ul>
                  {finding.limitations.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
                <p>
                  “No earlier observed positive stock” does not mean “never
                  stocked.” Reported positive inventory does not prove shelf
                  availability. Expansion compares internal history, not peers.
                </p>
              </article>
            </>
          )}
          {layer === "decision" && (
            <section className={s.card}>
              <p className={s.eyebrow}>Your judgment, supported by evidence</p>
              <h2>Choose a question to pursue</h2>
              <p>
                No action is recommended, authorized or assigned an estimated
                benefit.
              </p>
              <div className={s.options}>
                {data.review.options.map((option) => (
                  <label key={option.key} className={s.option}>
                    <input
                      type="radio"
                      name="review"
                      value={option.key}
                      checked={note.option === option.key}
                      onChange={() => setNote({ ...note, option: option.key })}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.verification}</small>
                    </span>
                  </label>
                ))}
              </div>
              <label className={s.field}>
                Demo review status
                <select
                  value={note.status}
                  onChange={(event) =>
                    setNote({
                      ...note,
                      status: noteSchema.shape.status.parse(event.target.value),
                    })
                  }
                >
                  {noteSchema.shape.status.options.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className={s.field}>
                Your context
                <textarea
                  maxLength={2000}
                  value={note.text}
                  onChange={(event) =>
                    setNote({ ...note, text: event.target.value })
                  }
                  placeholder="Add the business context only you know."
                />
              </label>
              <button
                className={s.primary}
                disabled={!note.option}
                onClick={() => {
                  try {
                    const parsed = noteSchema.parse(note);
                    sessionStorage.setItem(key, JSON.stringify(parsed));
                    window.dispatchEvent(new Event("memento-review-note"));
                    setNotice(
                      "Demo note saved for this browser tab and release. No approval was sent and no order changed.",
                    );
                  } catch {
                    setNotice("The demo note could not be saved.");
                  }
                }}
              >
                Save demo note
              </button>
              <p className={s.footnote}>
                {data.review.workflow} Notes last for this tab’s browser
                session, are not shared, and do not cross dataset releases.{" "}
                {saved && `Saved status: ${saved.status}.`}
              </p>
              <h3>Decision result</h3>
              <p>{data.review.result}</p>
            </section>
          )}
          {layer === "evidence" && (
            <>
              <section className={s.card}>
                <div className={s.sectionHead}>
                  <div>
                    <h2>Every affected store</h2>
                    <p>
                      {number(data.evidence.length)} complete members loaded.
                      Group totals above remain unfiltered.
                    </p>
                  </div>
                  <button
                    className={s.primary}
                    onClick={() => {
                      try {
                        downloadEvidence(
                          metadata.metric_release_id,
                          finding,
                          data.evidence,
                        );
                        setNotice(
                          "Complete evidence download prepared, including release identity, operands and limitations.",
                        );
                      } catch {
                        setNotice(
                          "Export failed. No partial evidence was downloaded.",
                        );
                      }
                    }}
                  >
                    Download complete evidence
                  </button>
                </div>
                <label className={s.search}>
                  Filter store evidence
                  <input
                    value={filter}
                    onChange={(event) => {
                      setFilter(event.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <p>
                  {filtered.length} matching members; this does not change
                  finding-level totals.
                </p>
                <div className={s.scroll}>
                  <table>
                    <caption>
                      Affected store evidence · select a store to inspect its
                      trace
                    </caption>
                    <thead>
                      <tr>
                        {[
                          "Store",
                          "Region",
                          "On hand",
                          "Firm unmet, 28d",
                          "Conditional unmet, 28d",
                          "Source plan review",
                          "Missing evidence",
                        ].map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(page * 25, (page + 1) * 25).map((row) => (
                        <tr key={row.evidence_id}>
                          <th>
                            <button
                              className={s.textButton}
                              onClick={() =>
                                navigate("evidence", row.location_id)
                              }
                            >
                              {row.facts.store_name}
                            </button>
                          </th>
                          <td>{row.facts.region ?? "Unknown"}</td>
                          <td>{number(row.facts.on_hand)}</td>
                          <td>{number(row.facts.firm_unfulfilled_units)}</td>
                          <td>
                            {number(row.facts.conditional_unfulfilled_units)}
                          </td>
                          <td>{dateLabel(row.plan_review_date)}</td>
                          <td>
                            {row.missing_evidence.length
                              ? row.missing_evidence.map(words).join(", ")
                              : "None declared"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={s.pills}>
                  <button disabled={!page} onClick={() => setPage(page - 1)}>
                    Previous stores
                  </button>
                  <span>
                    Page {page + 1} /{" "}
                    {Math.max(1, Math.ceil(filtered.length / 25))}
                  </span>
                  <button
                    disabled={(page + 1) * 25 >= filtered.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next stores
                  </button>
                </div>
              </section>
              {selected ? (
                <section className={s.card}>
                  <h2>{selected.facts.store_name}</h2>
                  <p>
                    {selected.location_id} · observed{" "}
                    {selected.facts.observation_date}
                  </p>
                  {selected.facts.expansion_comparison && (
                    <>
                      <h3>Internal same-store comparison</h3>
                      <dl>
                        {Object.entries(selected.facts.expansion_comparison)
                          .filter(([key]) =>
                            [
                              "baseline_units_store_week",
                              "recent_units_store_week",
                              "baseline_dollars_store_week",
                              "recent_dollars_store_week",
                              "first_change_pct",
                              "second_change_pct",
                            ].includes(key),
                          )
                          .map(([key, value]) => (
                            <div key={key}>
                              <dt>{words(key)}</dt>
                              <dd>
                                {typeof value === "number"
                                  ? number(value)
                                  : "Unavailable"}
                              </dd>
                            </div>
                          ))}
                      </dl>
                      <p>
                        Not peer/category performance, causal lift or a buyer
                        authorization.
                      </p>
                    </>
                  )}
                  {selected.facts.excess_calculation && (
                    <dl>
                      <dt>Firm excess units at horizon</dt>
                      <dd>
                        {number(
                          selected.facts.excess_calculation.firm_excess_units,
                        )}
                      </dd>
                      <dt>Conditional excess units at horizon</dt>
                      <dd>
                        {number(
                          selected.facts.excess_calculation
                            .conditional_excess_units,
                        )}
                      </dd>
                    </dl>
                  )}
                  <StoreTrace
                    key={selected.evidence_id}
                    metadata={metadata}
                    evidence={selected}
                  />
                  <h3>Future plans, not firm orders</h3>
                  {selected.facts.plans.length ? (
                    <div className={s.scroll}>
                      <table>
                        <caption>Source planned-order evidence</caption>
                        <thead>
                          <tr>
                            <th>Plan</th>
                            <th>Source placement</th>
                            <th>Store arrival</th>
                            <th>Remaining units</th>
                            <th>Projection eligibility</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.facts.plans.map((plan) => (
                            <tr key={plan.plan_id}>
                              <th>{plan.plan_id}</th>
                              <td>{plan.order_place_dt}</td>
                              <td>{plan.sched_arvl_dt}</td>
                              <td>{number(plan.remaining_planned_qty)}</td>
                              <td>
                                {plan.eligible_for_projection
                                  ? "Eligible, not guaranteed"
                                  : "Excluded"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>
                      No plan rows are present for this member. Missing feed and
                      zero plans are not interchangeable.
                    </p>
                  )}
                  <details>
                    <summary>Exact operands & source references</summary>
                    <pre>{JSON.stringify(selected.facts, null, 2)}</pre>
                  </details>
                </section>
              ) : (
                <p role="alert">
                  That store is not a member of this finding in the selected
                  release.
                </p>
              )}
            </>
          )}
          <p role="status" className={s.notice}>
            {notice}
          </p>
        </>
      )}
    </section>
  );
}
