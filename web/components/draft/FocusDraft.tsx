"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ReleaseGate } from "@/components/product/ReleaseProvider";
import { fetchSignalDetail } from "@/lib/signal/client";
import type { SignalDetail, SignalQueue, SignalRow } from "@/lib/signal/schema";
import {
  formatCutoff,
  formatMoney,
  formatNumber,
  formatScore,
  humanize,
} from "@/lib/signal/presentation";
import {
  calculation,
  economics,
  nextWeek,
  storyFor,
  timing,
} from "@/lib/draft/story";
import {
  saveDraftPlan,
  useDraftPlans,
  type DraftPlan,
} from "@/lib/draft/plans";
import {
  Arrow,
  EvidencePicture,
  PriorityPrism,
  ScoreStrip,
} from "./FocusVisuals";
import s from "./FocusDraft.module.css";

const preciseNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

export default function FocusDraft() {
  return (
    <ReleaseGate>{(queue) => <FocusExperience queue={queue} />}</ReleaseGate>
  );
}

function FocusExperience({ queue }: { queue: SignalQueue }) {
  const params = useSearchParams();
  const router = useRouter();
  const plans = useDraftPlans();
  const selected = queue.signals.find(
    (signal) => signal.signal_id === params.get("signal"),
  );
  const review = params.get("view") === "review";
  const layer =
    params.get("layer") === "decision"
      ? "decision"
      : params.get("layer") === "evidence"
        ? "evidence"
        : "situation";
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [selected?.signal_id, review, layer]);
  const open = (signal: SignalRow, next = "situation") =>
    router.push(`/draft?signal=${signal.signal_id}&layer=${next}`);
  const home = () => router.push("/draft");
  return (
    <div className={s.app}>
      <a className={s.skip} href="#focus-content">
        Skip to your focus
      </a>
      <header className={s.header}>
        <Link className={s.brand} href="/draft" aria-label="Memento Loop home">
          <span className={s.brandMark} aria-hidden="true">
            <i />
            <i />
          </span>
          <span>
            memento<span className={s.brandLoop}>loop</span>
          </span>
        </Link>
        <nav aria-label="Draft navigation" className={s.nav}>
          <Link href="/draft" aria-current={!review ? "page" : undefined}>
            This week
          </Link>
          <Link
            href="/draft?view=review"
            aria-current={review ? "page" : undefined}
          >
            Follow-through <span>{plans.length}</span>
          </Link>
        </nav>
        <div className={s.account}>
          <span>
            Walmart <span className={s.accountDot}>·</span> Miro Spark
          </span>
          <span className={s.avatar} aria-label="Demo user">
            M
          </span>
        </div>
      </header>
      <main id="focus-content" className={s.main}>
        <div ref={heading} tabIndex={-1} className={s.focusTarget} />
        {review ? (
          <FollowThrough
            plans={plans}
            queue={queue}
            onOpen={open}
            onHome={home}
          />
        ) : selected ? (
          <SignalRoom
            key={selected.signal_id}
            signal={selected}
            queue={queue}
            layer={layer}
            onLayer={(next) => open(selected, next)}
            onHome={home}
            onSaved={() => router.push("/draft?view=review&saved=1")}
            existing={plans.find(
              (p) =>
                p.signalId === selected.signal_id &&
                p.releaseId === queue.run.signal_set_id,
            )}
          />
        ) : (
          <Briefing queue={queue} plans={plans} onOpen={open} />
        )}
      </main>
      <footer className={s.footer}>
        <span>
          <i />
          Synthetic demo <span className={s.footerSep}>/</span> Interface
          concept 01
        </span>
        <span>Published scores & outcomes · draft analyst interpretation</span>
        <Link href="/monday">
          Original demo <Arrow />
        </Link>
      </footer>
    </div>
  );
}

function Money({
  signal,
  large = false,
}: {
  signal: SignalRow;
  large?: boolean;
}) {
  const [pinned, setPinned] = useState(false);
  const id = `calculation-${signal.signal_id}-${large ? "hero" : "card"}`;
  return (
    <span
      className={`${s.money} ${large ? s.moneyLarge : ""}`}
      data-pinned={pinned}
    >
      <button
        type="button"
        aria-label={`How ${formatMoney(economics(signal))} is calculated`}
        aria-describedby={id}
        aria-expanded={pinned}
        onClick={() => setPinned((value) => !value)}
        onBlur={() => setPinned(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setPinned(false);
            event.currentTarget.blur();
          }
        }}
      >
        {formatMoney(economics(signal))}
        <span className={s.moneyHint}>ⓘ</span>
      </button>
      <span role="tooltip" id={id} className={s.tooltip}>
        <strong>Behind this number</strong>
        {calculation(signal)}
      </span>
    </span>
  );
}

function Briefing({
  queue,
  plans,
  onOpen,
}: {
  queue: SignalQueue;
  plans: DraftPlan[];
  onOpen: (signal: SignalRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lens, setLens] = useState<"all" | "risk" | "opportunity" | "balance">(
    "all",
  );
  const first = queue.signals[0];
  if (!first)
    return (
      <div className={s.empty}>
        <p className={s.eyebrow}>A quieter week</p>
        <h1>Nothing needs your attention here.</h1>
        <p>No signals were published in this release.</p>
      </div>
    );
  const story = storyFor(first);
  const rest = queue.signals
    .slice(1)
    .filter(
      (signal) =>
        lens === "all" ||
        (lens === "risk"
          ? signal.signal_direction === "risk"
          : lens === "opportunity"
            ? signal.signal_direction === "acceleration"
            : ["excess", "deceleration"].includes(signal.signal_direction)),
    );
  return (
    <>
      <section className={s.welcome}>
        <div>
          <p className={s.eyebrow}>
            <span className={s.liveDot} />
            Your weekly perspective <span>/</span>{" "}
            {formatCutoff(queue.run.signal_as_of)}
          </p>
          <h1>
            Less noise.
            <br />
            More <em>knowing what matters.</em>
          </h1>
        </div>
        <div className={s.welcomeNote}>
          <span className={s.tinyOrbit} aria-hidden="true">
            ✳
          </span>
          <p>
            We found the signals.
            <br />
            Let’s find your next move.
          </p>
        </div>
      </section>
      <section
        className={s.focusCard}
        data-theme={story.theme}
        aria-label="Your recommended focus"
      >
        <div className={s.heroCopy}>
          <div className={s.cardEyebrow}>
            <span className={s.rankPill}>01</span> START HERE{" "}
            <span className={s.category}>{story.label}</span>
          </div>
          <h2>{story.title}</h2>
          <p className={s.heroDescription}>
            {first.identity.item_name}{" "}
            <span>at {first.identity.store_name}</span>
          </p>
          <div className={s.heroEconomics}>
            <Money signal={first} large />
            <span>
              {story.outcome}
              <br />
              <small>over the next 28 days</small>
            </span>
          </div>
          <div className={s.heroActions}>
            <button className={s.primary} onClick={() => onOpen(first)}>
              Let’s take a look <Arrow />
            </button>
            <span className={s.timing}>
              <i />
              {timing(first)}
            </span>
          </div>
        </div>
        <div className={s.heroVisual}>
          <div className={s.priorityFloat}>
            <span>PUBLISHED PRIORITY</span>
            <strong>
              {formatScore(first.rank_score)}
              <small>/100</small>
            </strong>
          </div>
          <PriorityPrism signal={first} />
          <ScoreStrip signal={first} />
        </div>
      </section>
      <section className={s.nextSection} aria-labelledby="next-title">
        <div className={s.sectionHead}>
          <div>
            <p className={s.eyebrow}>A little more perspective</p>
            <h2 id="next-title">
              Next in your orbit<span>.</span>
            </h2>
          </div>
          <span className={s.sectionAside}>
            Published order. One decision at a time.
          </span>
        </div>
        <div className={s.filters} aria-label="Explore signal outcomes">
          {(
            [
              { id: "all", label: "Everything" },
              { id: "risk", label: "Protect sales" },
              { id: "opportunity", label: "Capture demand" },
              { id: "balance", label: "Find balance" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-pressed={lens === item.id}
              onClick={() => {
                setLens(item.id);
                setExpanded(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={s.cards}>
          {rest.slice(0, expanded ? 10 : 3).map((signal) => {
            const copy = storyFor(signal);
            const planned = plans.some(
              (p) =>
                p.signalId === signal.signal_id &&
                p.releaseId === queue.run.signal_set_id,
            );
            return (
              <article
                className={s.smallCard}
                key={signal.signal_id}
                data-theme={copy.theme}
              >
                <div className={s.smallTop}>
                  <span className={s.outcomeIcon} aria-hidden="true">
                    {copy.symbol}
                  </span>
                  <span>{copy.label}</span>
                  <span className={s.smallRank}>
                    /{String(signal.overall_rank_position).padStart(2, "0")}
                  </span>
                </div>
                <button
                  className={s.cardLink}
                  onClick={() => onOpen(signal)}
                  aria-label={`Investigate ${signal.identity.item_name}: ${copy.label}`}
                >
                  <h3>{copy.short}</h3>
                  <p>
                    {signal.identity.item_name}{" "}
                    <span>· {signal.identity.store_name}</span>
                  </p>
                  <span className={s.cardArrow} aria-hidden="true">
                    ↗
                  </span>
                </button>
                <div className={s.smallBottom}>
                  <div>
                    <Money signal={signal} />
                    <span className={s.smallMetricLabel}>{copy.outcome}</span>
                  </div>
                  <span className={s.smallTiming}>
                    {planned ? "✓ In your plan" : timing(signal)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
        {!rest.length && (
          <p className={s.noMatches}>
            No other signals of this kind in the published queue. Your
            recommended focus stays above.
          </p>
        )}
        {rest.length > 3 && (
          <button
            className={s.textButton}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? "Keep it focused ↑"
              : `See ${rest.length - 3} more signals ↓`}
          </button>
        )}
      </section>
      <aside className={s.analystNote}>
        <span className={s.analystMark}>✳</span>
        <div>
          <strong>A note from your analytical side.</strong>
          <p>
            {queue.run.candidate_count.toLocaleString()} eligible store–item
            signals sit behind this release. These {queue.signals.length} are
            the published priorities. The three dimensions help direct
            attention; they don’t replace your judgment.
          </p>
        </div>
        <span className={s.noteSignature}>
          A little clarity goes a long way.
        </span>
      </aside>
    </>
  );
}

type Layer = "situation" | "decision" | "evidence";

function SignalRoom({
  signal,
  queue,
  layer,
  onLayer,
  onHome,
  onSaved,
  existing,
}: {
  signal: SignalRow;
  queue: SignalQueue;
  layer: Layer;
  onLayer: (layer: Layer) => void;
  onHome: () => void;
  onSaved: () => void;
  existing?: DraftPlan;
}) {
  const story = storyFor(signal);
  const [question, setQuestion] = useState<"why" | "change" | null>(null);
  return (
    <div className={s.room} data-theme={story.theme}>
      <button className={s.breadcrumb} onClick={onHome}>
        <Arrow back /> Your week <span>/</span> Focus{" "}
        {String(signal.overall_rank_position).padStart(2, "0")}
      </button>
      <div className={s.roomHeader}>
        <div>
          <p className={s.eyebrow}>
            {story.label} <span>·</span> {signal.identity.store_name}
          </p>
          <h1>{story.verb}</h1>
          <p className={s.muted}>
            {signal.identity.item_name} <span>·</span>{" "}
            {signal.identity.company_item_id}
          </p>
        </div>
        <div className={s.roomMoney}>
          <Money signal={signal} large />
          <span>{story.outcome}</span>
        </div>
      </div>
      <div className={s.roomGrid}>
        <aside className={s.journey}>
          <p className={s.eyebrow}>Follow the thread</p>
          {(
            [
              {
                id: "situation",
                label: "Understand the signal",
                caption: "The story, in plain language",
              },
              {
                id: "decision",
                label: "Choose your next move",
                caption: "A response you can follow up",
              },
              {
                id: "evidence",
                label: "Look under the hood",
                caption: "The numbers, when you need them",
              },
            ] as const
          ).map((step, index) => (
            <button
              key={step.id}
              aria-current={layer === step.id ? "step" : undefined}
              onClick={() => onLayer(step.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.caption}</small>
              </div>
            </button>
          ))}
          <div className={s.journeyNote}>
            <span>✳</span>
            <p>You don’t need every number to make a good next decision.</p>
          </div>
        </aside>
        <div className={s.roomBody} key={layer}>
          {layer === "situation" ? (
            <>
              <section className={s.storyCard}>
                <div className={s.storyHeader}>
                  <span className={s.analystMark}>✳</span>
                  <p className={s.eyebrow}>
                    The analyst’s read <span>· Draft</span>
                  </p>
                </div>
                <h2>{story.title}</h2>
                <p className={s.storyText}>{story.read}</p>
                <div className={s.signalFacts}>
                  <div>
                    <span>The modeled gap</span>
                    <strong>
                      {formatNumber(signal.headline_metric_value)}{" "}
                      <small>units</small>
                    </strong>
                  </div>
                  <div>
                    <span>Material impact</span>
                    <strong>
                      {signal.days_until_material_impact}{" "}
                      <small>days from snapshot</small>
                    </strong>
                  </div>
                  <div>
                    <span>Decision window</span>
                    <strong className={s.deadline}>{timing(signal)}</strong>
                  </div>
                </div>
                <p className={s.caption}>
                  Snapshot: {signal.observation_date}. Supply timing remains an
                  illustrative assumption.
                </p>
              </section>
              <section className={s.scoreContext}>
                <div className={s.sectionHead}>
                  <h3>Why this deserves a look.</h3>
                  <span>Tap a dimension to unpack it</span>
                </div>
                <ScoreStrip signal={signal} />
              </section>
              <div className={s.questions}>
                <span>One more thing?</span>
                <button
                  aria-expanded={question === "why"}
                  onClick={() => setQuestion(question === "why" ? null : "why")}
                >
                  Why now? <span>+</span>
                </button>
                <button
                  aria-expanded={question === "change"}
                  onClick={() =>
                    setQuestion(question === "change" ? null : "change")
                  }
                >
                  What could change this? <span>+</span>
                </button>
              </div>
              {question && (
                <div className={s.answer} role="status">
                  <span>✳</span>
                  <p>
                    {question === "why"
                      ? `The published priority is ${formatScore(signal.rank_score)}/100. ${signal.decision_slack_days == null ? "This release does not publish a deadline-based urgency score." : `The conservative start-by is ${signal.decision_slack_days < 0 ? `${Math.abs(signal.decision_slack_days)} days before` : `${signal.decision_slack_days} days after`} the snapshot. That makes the timing worth reviewing now.`} The impact score compares this signal with others of the same type.`
                      : `${story.watch} A change in any of these inputs may change the next release. Confidence measures evidence quality, not certainty about what happens next.`}
                  </p>
                </div>
              )}
              <div className={s.nextStep}>
                <div>
                  <span>THE NEXT QUESTION</span>
                  <h3>{story.question}</h3>
                </div>
                <button
                  className={s.primary}
                  onClick={() => onLayer("decision")}
                >
                  See my next moves <Arrow />
                </button>
              </div>
            </>
          ) : layer === "decision" ? (
            <Decision
              key={signal.signal_id}
              signal={signal}
              releaseId={queue.run.signal_set_id}
              onSaved={onSaved}
              existing={existing}
            />
          ) : (
            <Evidence signal={signal} queue={queue} />
          )}
        </div>
      </div>
    </div>
  );
}

function Decision({
  signal,
  releaseId,
  onSaved,
  existing,
}: {
  signal: SignalRow;
  releaseId: string;
  onSaved: () => void;
  existing?: DraftPlan;
}) {
  const story = storyFor(signal);
  const [choice, setChoice] = useState(
    existing?.action ?? story.options[0].label,
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState(false);
  const option =
    story.options.find((item) => item.label === choice) ?? story.options[0];
  return (
    <section className={s.decision}>
      <p className={s.eyebrow}>A decision, with a memory</p>
      <h2>What’s your next move?</h2>
      <p className={s.storyText}>
        Choose the response you want to follow up on. We’ll keep the original
        signal beside it, so next week starts with a better question.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const today = new Date().toISOString().slice(0, 10);
          const saved = saveDraftPlan({
            signalId: signal.signal_id,
            releaseId,
            item: signal.identity.item_name,
            location: signal.identity.store_name,
            action: choice,
            watch: option.watch,
            note,
            recordedOn: today,
            reviewOn: nextWeek(today),
          });
          if (saved) onSaved();
          else setError(true);
        }}
      >
        <fieldset className={s.options}>
          <legend className="sr-only">Choose a response to this signal</legend>
          {story.options.map((item, index) => (
            <label key={item.id} className={s.option}>
              <input
                type="radio"
                name="response"
                checked={choice === item.label}
                onChange={() => setChoice(item.label)}
              />
              <span className={s.radioMark} />
              <span>
                <strong>
                  {item.label}
                  {index === 0 && <small>Start here</small>}
                </strong>
                <span>{item.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <details className={s.noteDisclosure}>
          <summary>
            Add a note for next week <span>+</span>
          </summary>
          <label>
            What do you want to remember?
            <textarea
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="For example: check receipt timing with the supply team."
            />
          </label>
        </details>
        <div className={s.reviewPreview}>
          <span className={s.reviewIcon}>↻</span>
          <div>
            <span className={s.eyebrow}>Next week, we’ll ask</span>
            <h3>{option.watch}</h3>
            <p>Compare the next published snapshot with this one.</p>
          </div>
        </div>
        <button className={s.primary} type="submit">
          {existing ? "Update my follow-through" : "Add to my follow-through"}{" "}
          <Arrow />
        </button>
        <p className={s.localNote}>
          Saved in this browser for the draft. No order is placed or changed.
        </p>
        {error && (
          <p role="alert">
            This browser could not save the response. Enable local storage and
            try again.
          </p>
        )}
      </form>
    </section>
  );
}

function Evidence({
  signal,
  queue,
}: {
  signal: SignalRow;
  queue: SignalQueue;
}) {
  const [detail, setDetail] = useState<SignalDetail | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<{
    key: string;
    controller: AbortController;
    promise: Promise<SignalDetail>;
  } | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const key = `${signal.signal_id}:${queue.run.configuration_hash}:${attempt}`;
    if (pending.current?.key !== key) {
      pending.current?.controller.abort();
      const controller = new AbortController();
      pending.current = {
        key,
        controller,
        promise: fetchSignalDetail(signal.signal_id, controller.signal),
      };
    }
    const request = pending.current;
    const token = ++generation.current;
    const lifecycle = generation;
    let active = true;
    request.promise
      .then((value) => {
        if (!active || request.controller.signal.aborted) return;
        if (
          value.signal.signal_id !== signal.signal_id ||
          value.signal.configuration_hash !== queue.run.configuration_hash ||
          value.signal.canonical_dataset_id !==
            queue.run.canonical_dataset_id ||
          Date.parse(value.signal.signal_as_of) !==
            Date.parse(queue.run.signal_as_of)
        )
          throw new Error("Release mismatch");
        setDetail(value);
      })
      .catch(() => {
        if (active && !request.controller.signal.aborted) setError(true);
      });
    // Share the request across Strict Mode's synchronous effect replay while
    // cancelling on a real unmount, release change, or retry.
    return () => {
      active = false;
      queueMicrotask(() => {
        if (lifecycle.current === token) request.controller.abort();
      });
    };
  }, [
    signal.signal_id,
    queue.run.configuration_hash,
    queue.run.canonical_dataset_id,
    queue.run.signal_as_of,
    attempt,
  ]);
  if (error)
    return (
      <div className={s.storyCard} role="alert">
        <h2>The evidence couldn’t be matched.</h2>
        <p>Reload the published evidence before using these numbers.</p>
        <button
          className={s.primary}
          onClick={() => {
            setError(false);
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  if (!detail)
    return (
      <div className={s.loading} role="status">
        <span className={s.analystMark}>✳</span>Bringing the evidence into
        focus…
      </div>
    );
  const demand = signal.signal_type === "demand_momentum";
  const fields = demand
    ? ([
        "actual_units",
        "retailer_forecast_units",
        "adjusted_forecast_units",
      ] as const)
    : ([
        "opening_units",
        "demand_units",
        "scheduled_inbound_units",
        "ending_units",
        "lost_units",
        "target_units",
      ] as const);
  return (
    <section className={s.evidence}>
      <p className={s.eyebrow}>The evidence layer</p>
      <h2>A clear view of the moving parts.</h2>
      <p className={s.storyText}>
        The published base path, with every number available when you need it.
      </p>
      <EvidencePicture detail={detail} />
      <details className={s.evidenceDisclosure}>
        <summary>
          <span>
            <strong>The calculation</strong>
            <small>How the dollars connect to units</small>
          </span>
          <span>+</span>
        </summary>
        <div className={s.disclosureBody}>
          <p>{calculation(signal)}</p>
          <p>
            Applicable price and cost are frozen with this release. Economic
            magnitudes across different signal types should not be added
            together.
          </p>
        </div>
      </details>
      {detail.supply_context && (
        <details className={s.evidenceDisclosure}>
          <summary>
            <span>
              <strong>Supply assumptions</strong>
              <small>Expected arrivals, timing, and feasibility</small>
            </span>
            <span>+</span>
          </summary>
          <div className={s.disclosureBody}>
            <p>
              These timings are synthetic assumptions. Capacity, stock, and
              authority must be checked before execution.
            </p>
            {detail.supply_context.actions.map((action) => (
              <div className={s.supplyRow} key={action.action}>
                <strong>{humanize(action.action)}</strong>
                <span>
                  {action.typical_days}d typical / {action.conservative_days}d
                  conservative
                </span>
                <small>
                  Feasibility: {humanize(action.feasibility)} · Check:{" "}
                  {action.missing_prerequisites.map(humanize).join(", ") ||
                    "none declared"}
                </small>
              </div>
            ))}
          </div>
        </details>
      )}
      <details className={s.evidenceDisclosure}>
        <summary>
          <span>
            <strong>The complete ledger</strong>
            <small>
              {detail.evidence.length} published rows · all paths and dates
            </small>
          </span>
          <span>+</span>
        </summary>
        <div className={s.ledgerScroll}>
          <table
            className={s.table}
            aria-label="Draft published evidence ledger"
          >
            <thead>
              <tr>
                <th>Date</th>
                <th>Path</th>
                {fields.map((field) => (
                  <th key={field}>{humanize(field.replace("_units", ""))}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.evidence.map((row, index) => (
                <tr key={index}>
                  <td>{row.evidence_date}</td>
                  <td>{row.path ?? "history"}</td>
                  {fields.map((field) => (
                    <td key={field}>
                      {row[field] == null
                        ? "—"
                        : preciseNumber.format(Number(row[field]))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className={s.evidenceDisclosure}>
        <summary>
          <span>
            <strong>Evidence quality & lineage</strong>
            <small>The inputs behind confidence and this snapshot</small>
          </span>
          <span>+</span>
        </summary>
        <div className={s.disclosureBody}>
          <div className={s.signalFacts}>
            <div>
              <span>Forecast quality</span>
              <strong>{formatScore(detail.signal.forecast_quality)}</strong>
            </div>
            <div>
              <span>Completeness</span>
              <strong>{formatScore(detail.signal.data_completeness)}</strong>
            </div>
            <div>
              <span>Stability</span>
              <strong>{formatScore(detail.signal.stability_score)}</strong>
            </div>
          </div>
          <p>
            Confidence is a published evidence-quality score, not a probability.
          </p>
          <dl className={s.lineage}>
            <dt>Signal</dt>
            <dd>{signal.signal_id}</dd>
            <dt>Release</dt>
            <dd>{queue.run.signal_set_id}</dd>
            <dt>Canonical dataset</dt>
            <dd>{queue.run.canonical_dataset_id}</dd>
            <dt>Scoring policy</dt>
            <dd>{queue.run.ranker_version}</dd>
            <dt>Observed through</dt>
            <dd>{signal.observation_date}</dd>
          </dl>
        </div>
      </details>
    </section>
  );
}

function FollowThrough({
  plans,
  queue,
  onOpen,
  onHome,
}: {
  plans: DraftPlan[];
  queue: SignalQueue;
  onOpen: (signal: SignalRow) => void;
  onHome: () => void;
}) {
  const params = useSearchParams();
  return (
    <section className={s.followThrough}>
      <button className={s.breadcrumb} onClick={onHome}>
        <Arrow back /> Your week
      </button>
      <p className={s.eyebrow}>Clarity compounds</p>
      <h1>
        Good decisions deserve
        <br />
        <em>a second conversation.</em>
      </h1>
      <p className={s.followIntro}>
        Your responses, the signals behind them, and what to check next.
      </p>
      {params.get("saved") === "1" && (
        <div className={s.saved} role="status">
          <span>✓</span> Your next move is saved. You’ve given next week a head
          start.
        </div>
      )}
      {!plans.length ? (
        <div className={s.empty}>
          <span className={s.bigLoop}>↻</span>
          <h2>Your next week starts here.</h2>
          <p>
            Choose a response while investigating a signal. It will appear here
            with a question to revisit.
          </p>
          <button className={s.primary} onClick={onHome}>
            Find my focus <Arrow />
          </button>
        </div>
      ) : (
        <div className={s.planList}>
          {[...plans].reverse().map((plan) => {
            const current = queue.signals.find(
              (signal) =>
                signal.signal_id === plan.signalId &&
                queue.run.signal_set_id === plan.releaseId,
            );
            return (
              <article
                key={`${plan.releaseId}-${plan.signalId}`}
                className={s.planCard}
              >
                <div className={s.planTop}>
                  <span className={s.eyebrow}>
                    REVISIT {formatCutoff(`${plan.reviewOn}T00:00:00Z`)}
                  </span>
                  <span className={s.pending}>
                    <i />
                    Awaiting next snapshot
                  </span>
                </div>
                <h2>{plan.action}</h2>
                <p className={s.muted}>
                  {plan.item} · {plan.location}
                </p>
                <div className={s.planQuestion}>
                  <span>↳</span>
                  <p>{plan.watch}</p>
                </div>
                {plan.note && <p className={s.userNote}>“{plan.note}”</p>}
                <div className={s.planBottom}>
                  <span>
                    Chosen {formatCutoff(`${plan.recordedOn}T00:00:00Z`)}
                  </span>
                  {current && (
                    <button
                      className={s.textButton}
                      onClick={() => onOpen(current)}
                    >
                      Reopen the signal <Arrow />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className={s.localNote}>
        Draft follow-through is stored only in this browser. Outcomes need a new
        data snapshot and have not been measured yet.
      </p>
    </section>
  );
}
