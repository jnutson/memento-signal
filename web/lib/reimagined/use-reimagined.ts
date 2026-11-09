"use client";
import { workspaceStorageKey } from "@/lib/workspace-path";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import {
  allRows,
  loadFindings,
  loadMetadata,
  supportsFindings,
} from "@/lib/connected/client";
import {
  evidenceSchema,
  type Evidence,
  type Finding,
  type Metadata,
} from "@/lib/connected/schema";
import { csvCell, downloadEvidence } from "@/lib/connected/export";
import { words } from "@/lib/connected/presentation";
import {
  chartWeeks,
  exposureLabel,
  findingCopy,
  loadAttention,
  distributions,
  loadSeries,
  periods,
  type CatalogPeriod,
  type Distribution,
  type Attention,
  type Series,
} from "./data";
import {
  chartPicture,
  chip,
  css,
  daysBetween,
  money,
  compactMoney,
  wholeUnits,
  number,
  percent,
  valueFor,
  valueLabel,
} from "./presentation";
import { emptyView, type Go, type Tile, type ViewModel } from "./view-model";
import { onePager } from "./one-pager";
import { caseMetrics, conciseStoryWhy } from "./case-metrics";
import {
  attentionQueue,
  attentionDollars,
  attentionDiameter,
  attentionOrder,
} from "./attention-view";
import {
  checkInDate,
  demoActions,
  statuses,
  statusColors,
  statusDots,
  statusSchema,
} from "./demo-workflow";

const noteSchema = z.object({
  name: z.string(),
  option: z.string(),
  status: statusSchema,
  owner: z.string(),
  text: z.string().max(5000),
});
const notesSchema = z.record(z.string(), noteSchema);
const subscribe = (listener: () => void) => {
  window.addEventListener("memento-original-note", listener);
  return () => window.removeEventListener("memento-original-note", listener);
};
const statusOrder = statuses;
type Loaded = {
  metadata: Metadata;
  findings: Finding[];
  periods: CatalogPeriod[];
  distribution: Distribution[];
  exposure: Attention;
  requested: string | null;
};
type Detail = {
  identity: string;
  evidence: Evidence[];
  series: Series;
  attention: Attention | null;
};
type Tip = { title: string; rows: Tile[]; foot: string; x: number; y: number };
const kinds = (finding: Finding) =>
  finding.finding_code === "availability_unknown"
    ? "u"
    : finding.finding_code === "observed_recovery"
      ? "r"
      : ["current_out_of_stock", "promised_distribution_gap"].includes(
            finding.finding_code,
          )
        ? "z"
        : finding.promise === "excess"
          ? "i"
          : finding.promise === "expansion"
            ? "d"
            : "a";
const sums = (rows: (number | null)[]) =>
  rows.length && rows.every((value) => value !== null)
    ? rows.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
const explicit = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export default function useReimagined(defaultRelease?: string): ViewModel {
  const params = useSearchParams(),
    router = useRouter();
  const requested = params.get("release") ?? defaultRelease ?? null;
  const [loaded, setLoaded] = useState<Loaded>();
  const [failure, setFailure] = useState<{
    requested: string | null;
    message: string;
  }>();
  const [detail, setDetail] = useState<Detail>();
  const [detailFailure, setDetailFailure] = useState<{
    identity: string;
    message: string;
  }>();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
  const [group, setGroup] = useState("sku");
  const [exploreFilter, setExploreFilter] = useState("all");
  const [regional, setRegional] = useState<CatalogPeriod[]>();
  const [mode, setMode] = useState<"sales" | "stock" | "stores">("sales");
  const [span, setSpan] = useState("next");
  const [tip, setTip] = useState<Tip>();
  const [hover, setHover] = useState<number>();
  const [notice, setNotice] = useState("");
  const [ask, setAsk] = useState("");
  const [modal, setModal] = useState<
    "report" | "growth" | "map" | "share" | null
  >(null);
  const [chosen, setChosen] = useState<{ identity: string; key: string }>();
  const [shareText, setShareText] = useState<string>();
  const [renderedPreview, setRenderedPreview] = useState<{
    identity: string;
    url: string;
    ratio: number;
  }>();
  const [owner, setOwner] = useState("Buyer");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>("[data-reimagined-search]")
          ?.focus();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setModal(null);
        setTip(undefined);
        setSearchOpen(false);
      }
      if (event.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>(
          "[data-reimagined-modal]",
        );
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input,textarea,select,a[href],[tabindex="0"]',
          ),
        );
        const first = focusable[0],
          last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>("[data-reimagined-modal] button")
        ?.focus(),
    );
    return () => {
      cancelAnimationFrame(frame);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [modal]);
  useEffect(() => {
    const abort = new AbortController();
    void loadMetadata(requested, abort.signal)
      .then(async (metadata) => {
        if (!supportsFindings(metadata))
          throw new Error(
            "This release does not contain finding evidence. Select a published v5 release. No preview facts are substituted.",
          );
        const [findings, itemPeriods, itemDistribution, exposure] =
          await Promise.all([
            loadFindings(metadata.metric_release_id, abort.signal),
            periods(metadata.metric_release_id, "item", abort.signal),
            distributions(metadata.metric_release_id, "item", abort.signal),
            loadAttention(metadata.metric_release_id, abort.signal),
          ]);
        if (
          exposure.rows.some(
            (row) =>
              !findings.some(
                (f) =>
                  f.finding_id === row.finding_id &&
                  f.product_id === row.product_id,
              ),
          ) ||
          findings.some(
            (f) =>
              !metadata.items.some((item) => item.product_id === f.product_id),
          )
        )
          throw new Error("Finding catalog identity mismatch.");
        if (!abort.signal.aborted)
          setLoaded({
            metadata,
            findings: findings.map(findingCopy),
            periods: itemPeriods,
            distribution: itemDistribution,
            exposure,
            requested,
          });
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setFailure({
            requested,
            message:
              error instanceof Error ? error.message : "Evidence unavailable.",
          });
      });
    return () => abort.abort();
  }, [requested]);
  const current = loaded?.requested === requested ? loaded : undefined;
  const release = current?.metadata.metric_release_id;
  useEffect(() => {
    if (release && !params.get("release")) {
      const query = new URLSearchParams(params.toString());
      query.set("release", release);
      router.replace(`/signal?${query}`, { scroll: false });
    }
  }, [release, params, router]);
  const finding = current?.findings.find(
    (row) => row.finding_id === params.get("finding"),
  );
  const product = finding?.product_id ?? params.get("item");
  const identity = `${release}:${finding?.finding_id ?? product}`;
  const item = current?.metadata.items.find(
    (row) => row.product_id === product,
  );
  const view =
    finding || (item && params.get("item"))
      ? "case"
      : params.get("view") === "explore"
        ? "explore"
        : "home";
  useEffect(() => {
    if (!release || !product) return;
    const abort = new AbortController();
    const members = finding
      ? allRows(
          "finding-evidence",
          evidenceSchema,
          release,
          { finding_id: finding.finding_id },
          abort.signal,
        )
      : Promise.resolve([] as Evidence[]);
    void Promise.all([
      members,
      loadSeries(release, product, finding?.finding_id ?? null, abort.signal),
      finding &&
      current?.exposure.rows.some(
        (row) => row.finding_id === finding.finding_id,
      )
        ? loadAttention(release, abort.signal, finding.finding_id)
        : Promise.resolve(null),
    ])
      .then(([evidence, series, attention]) => {
        if (
          finding &&
          (evidence.length !== finding.affected_store_count ||
            new Set(evidence.map((row) => row.location_id)).size !==
              evidence.length ||
            evidence.some(
              (row) =>
                row.finding_id !== finding.finding_id ||
                row.product_id !== finding.product_id,
            ))
        )
          throw new Error("Complete member evidence does not reconcile.");
        if (!abort.signal.aborted)
          setDetail({ identity, evidence, series, attention });
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setDetailFailure({
            identity,
            message:
              error instanceof Error ? error.message : "Evidence unavailable.",
          });
      });
    return () => abort.abort();
  }, [release, product, finding, identity, current]);
  useEffect(() => {
    if (!release || group !== "region") return;
    const abort = new AbortController();
    void periods(release, "region", abort.signal)
      .then((rows) => {
        if (!abort.signal.aborted) setRegional(rows);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setNotice(
            "Regional metrics unavailable; no preview figures substituted.",
          );
      });
    return () => abort.abort();
  }, [release, group]);
  const sessionKey = `memento-original-ui-v1:${release}`;
  const rawNotes = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(workspaceStorageKey(sessionKey));
      } catch {
        return null;
      }
    },
    () => null,
  );
  const notes = (() => {
    try {
      return rawNotes ? notesSchema.parse(JSON.parse(rawNotes)) : {};
    } catch {
      return {};
    }
  })();
  const saveNote = (id: string, value: z.infer<typeof noteSchema>) => {
    try {
      sessionStorage.setItem(
        workspaceStorageKey(sessionKey),
        JSON.stringify({ ...notes, [id]: noteSchema.parse(value) }),
      );
      window.dispatchEvent(new Event("memento-original-note"));
      setNotice(
        "Demo note saved in this tab. No approval sent, no order changed; effectiveness not measured.",
      );
    } catch {
      setNotice("The session note could not be saved.");
    }
  };
  const change = (values: Record<string, string | null>) => {
    const query = new URLSearchParams(params.toString());
    if (release) query.set("release", release);
    for (const [key, value] of Object.entries(values)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    setTip(undefined);
    setHover(undefined);
    setAsk("");
    setNotice("");
    if ("finding" in values || "item" in values) {
      setShareText(undefined);
      setModal(null);
    }
    router.push(`/signal?${query}`, { scroll: false });
    document
      .querySelector<HTMLElement>("[data-reimagined-root]")
      ?.scrollTo({ top: 0 });
  };
  const home = () =>
    change({ finding: null, item: null, view: null, layer: null });
  const open = (row: Finding) =>
    change({ finding: row.finding_id, item: null, layer: null });
  const openItem = (id: string) =>
    change({ item: id, finding: null, layer: "details" });
  const title = (row: Finding) =>
    current?.metadata.items.find((item) => item.product_id === row.product_id)
      ?.product_name ?? row.product_id;
  const tooltip = (title: string, rows: Tile[], foot = "") => ({
    enter: ((event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setTip({ title, rows, foot, x: rect.left, y: rect.bottom });
    }) as Go,
    leave: () => setTip(undefined),
  });
  const publishedOrder = tooltip(
    "Published order",
    [{ l: "Ordering", v: "Stable item/issue order" }],
    "Not a rank or a confidence probability. The first row is not a recommended action.",
  );
  const v = emptyView();
  v.home = view === "home";
  v.isCase = view === "case";
  v.vExplore = view === "explore";
  v.today = current
    ? `Observed ${current.metadata.observation_date}`
    : "Connecting…";
  v.homeStyle = css(
    `width:34px;height:34px;flex:none;border-radius:999px;display:flex;align-items:center;justify-content:center;border:1px solid ${v.home ? "#1d1d1f" : "#d6d6d2"};background:${v.home ? "#1d1d1f" : "#fff"};color:${v.home ? "#fff" : "#55554f"}`,
  );
  v.goHome = home;
  v.back = () => change({ finding: null, item: null, layer: null });
  v.nav = [
    {
      label: "Explore",
      go: () => change({ view: "explore", finding: null, item: null }),
      style: chip(view === "explore"),
    },
  ];
  v.openMap = () => setModal("map");
  v.mapOpen = modal === "map";
  v.mapClose = () => setModal(null);
  v.openRep = () => setModal("report");
  v.rep = modal === "report";
  v.repClose = () => setModal(null);
  v.openX = () => setModal("growth");
  v.xcOpen = modal === "growth";
  v.xcClose = () => setModal(null);
  v.sh = modal === "share";
  v.shClose = () => setModal(null);
  v.search = search;
  v.sOpen = searchOpen;
  v.onSearch = (event) => {
    setSearch(event.target.value);
    setSearchOpen(true);
  };
  v.onFocus = () => setSearchOpen(true);
  v.onBlur = () => setSearchOpen(false);
  const matches =
    current?.metadata.items.filter((item) =>
      item.product_name.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  v.results = matches.map((item) => ({
    name: item.product_name,
    type: item.source_product_id,
    open: () => {
      setSearchOpen(false);
      setSearch("");
      openItem(item.product_id);
    },
    dot: css("width:9px;height:9px;border-radius:50%;background:#0a7aff"),
  }));
  v.noResults = !matches.length;
  v.onKey = (event) => {
    if (event.key === "Enter" && matches[0]) {
      setSearchOpen(false);
      openItem(matches[0].product_id);
    }
    if (event.key === "Escape") setSearchOpen(false);
  };
  if (tip) {
    v.hasTip = true;
    v.tipTitle = tip.title;
    v.tipRows = tip.rows;
    v.tipFoot = tip.foot;
    v.tipStyle = css(
      `position:fixed;z-index:50;width:280px;padding:12px 14px;border-radius:12px;background:#1d1d1f;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);pointer-events:none;left:${Math.max(10, Math.min(tip.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 290))}px;top:${Math.min(tip.y + 8, (typeof window !== "undefined" ? window.innerHeight : 800) - 240)}px`,
    );
  }
  v.brief =
    notice ||
    (failure?.requested === requested
      ? failure.message
      : current
        ? `${current.metadata.items.length} ${current.metadata.items.length === 1 ? "item" : "items"}. Estimated exposure by type; largest dollars first. Expand a type for the full queue.`
        : "Loading and validating the published evidence. No mock data is used.");
  if (!current) {
    v.hero.name =
      failure?.requested === requested
        ? "Evidence unavailable"
        : "Connecting to the evidence…";
    v.hero.story = [{ t: v.brief }];
    return v;
  }
  const valuations = new Map(
    current.exposure.rows.map((row) => [row.finding_id, row]),
  );
  const groups = attentionQueue(
    current.findings,
    current.exposure.rows,
    filter,
    expandedTypes,
  );
  const displayed = groups.flatMap((group) => group.visible);
  const byId = new Map(current.findings.map((row) => [row.finding_id, row]));
  const named = displayed
    .slice()
    .sort(attentionOrder)
    .map((row) => byId.get(row.finding_id)!);
  const active = named[0];
  const financialValue = (row: Finding) =>
    valuations.has(row.finding_id)
      ? attentionDollars(valuations.get(row.finding_id)!)
      : valueFor(row);
  const financialLabel = (row: Finding) =>
    valuations.get(row.finding_id)?.lane === "z"
      ? "estimated missed sales + forward exposure"
      : valueLabel(row);
  const financialStory = (row: Finding) => {
    const value = valuations.get(row.finding_id);
    const stores = `${row.affected_store_count} ${row.affected_store_count === 1 ? "store" : "stores"}`;
    if (row.promise === "excess") {
      const basis =
        row.finding_code === "conditional_excess_inventory"
          ? "if eligible planned orders arrive"
          : "with firm supply only";
      return `${wholeUnits(row.units)} excess units across ${stores} at day 28, ${basis}. Estimated inventory capital: ${compactMoney(row.inventory_capital_amount)} at cost—not a markdown loss or potential saving.`;
    }
    if (row.finding_code === "future_supply_gap")
      return `Forecast demand exceeds supply by ${wholeUnits(row.units)} units across ${stores} over the next 28 days, even if eligible planned orders arrive. Estimated retail exposure: ${compactMoney(row.retail_exposure_amount)}, not measured lost sales.`;
    if (value?.lane !== "z") return row.interpretation;
    if (value.known_amount === null)
      return `${stores} ${row.affected_store_count === 1 ? "reports" : "report"} no inventory. Required valuation inputs are missing; open the evidence to review the dollar estimate.`;
    if (value.amount === null)
      return `${stores} ${row.affected_store_count === 1 ? "reports" : "report"} no inventory. ${attentionDollars(value)} of exposure is currently valued; ${value.valued_count} of ${value.member_count} store estimates are complete. Review the evidence for missing inputs.`;
    const dollars = (amount: number | null) =>
      exposureLabel({ amount, known_amount: amount });
    return `${stores} ${row.affected_store_count === 1 ? "reports" : "report"} no inventory. Estimated exposure: ${attentionDollars(value)} — ${dollars(value.retrospective_amount)} in missed sales to date + ${dollars(value.forward_amount)} through replenishment. This is an estimate, not measured losses.`;
  };
  v.queueTypes = groups
    .filter((group) => group.all.length)
    .map((group) => ({
      label:
        group.all.length <= 3
          ? `${group.label} · ${group.all.length}`
          : `${group.label} · ${group.visible.length} of ${group.all.length} · ${expandedTypes.includes(group.key) ? "Show less" : "Show all"}`,
      style: css(
        "border:0;background:transparent;color:#55554f;font-size:12px;font-weight:600;padding:6px 8px;cursor:pointer",
      ),
      go: () =>
        group.all.length <= 3
          ? setFilter(filter === group.key ? "all" : group.key)
          : setExpandedTypes((keys) =>
              keys.includes(group.key)
                ? keys.filter((key) => key !== group.key)
                : [...keys, group.key],
            ),
    }));
  const typeList = [
    ["Unavailable", "z"],
    ["Supply gap", "a"],
    ["Excess", "i"],
  ];
  v.stats = typeList.map(([label, key]) => {
    const bucket = current.exposure.buckets.find((row) => row.key === key)!;
    return {
      label,
      val: exposureLabel(bucket),
      go: () => setFilter(filter === key ? "all" : key),
      style: css(
        `background:#fff;border:1px solid ${filter === key ? "#1d1d1f" : "#d6d6d2"};border-radius:14px;box-shadow:0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04);padding:16px 18px;cursor:pointer;transition:transform .15s,border-color .15s`,
      ),
      ...tooltip(
        label === "Excess"
          ? "Modeled inventory capital"
          : "Modeled unmet retail demand",
        [
          { l: "Basis", v: bucket.basis },
          {
            l: "Valuation coverage",
            v: `${bucket.valued_count} of ${bucket.member_count} store-item pairs`,
          },
        ],
        (bucket.amount === null
          ? "A + marks the known subtotal; missing valuations are excluded. "
          : "") + current.exposure.limitation,
      ),
    };
  });
  v.bands = [
    {
      label: "This week",
      style: css(
        "position:absolute;top:0;bottom:0;left:0%;width:25%;background:#fdeceb",
      ),
    },
    {
      label: "Next week",
      style: css(
        "position:absolute;top:0;bottom:0;left:25%;width:25%;background:#fdf1df",
      ),
    },
    {
      label: "Later",
      style: css(
        "position:absolute;top:0;bottom:0;left:50%;width:50%;background:#f3f3f1",
      ),
    },
  ];
  const days = (row: Finding) =>
    row.first_event_date
      ? Math.max(0, daysBetween(row.as_of, row.first_event_date))
      : null;
  const dayText = (row: Finding) =>
    days(row) === null ? "Unknown" : days(row) === 0 ? "Now" : `${days(row)}d`;
  const bucketFor = (row: Finding) =>
    (days(row) ?? 0) <= 7 ? 0 : (days(row) ?? 0) <= 14 ? 1 : 2;
  const bucketCounts = groups.map((group) =>
    [0, 1, 2].map(
      (bucket) =>
        group.visible.filter(
          (value) => bucketFor(byId.get(value.finding_id)!) === bucket,
        ).length,
    ),
  );
  const laneHeight = Math.max(
    50,
    ...bucketCounts.flat().map((count) => Math.ceil(count / 4) * 36 + 10),
  );
  v.queueHeight = { height: `${laneHeight * 3 + 20}px` };
  v.queueLanes = groups.map((group, index) => ({
    label: group.label,
    style: css(
      `position:absolute;left:10px;top:${index * laneHeight + 18}px;font-size:10px;font-weight:600;color:#333;width:85px`,
    ),
  }));
  const maxDollars = Math.max(
    1,
    ...current.exposure.rows.map((row) => row.amount ?? row.known_amount ?? 0),
  );
  const used = new Map<string, number>();
  v.dots = displayed.map((value) => {
    const row = byId.get(value.finding_id)!,
      lane = groups.findIndex((group) => group.key === value.lane),
      bucket = bucketFor(row);
    const key = `${lane}:${bucket}`,
      index = used.get(key) ?? 0;
    used.set(key, index + 1);
    const start = [0, 25, 50][bucket],
      width = [25, 25, 50][bucket],
      columns = Math.min(4, bucketCounts[lane][bucket]);
    const x = start + width * (((index % 4) + 1) / (columns + 1));
    const size = attentionDiameter(
      value.amount ?? value.known_amount,
      maxDollars,
    );
    return {
      name: `${title(row)} · ${groups[lane].label} · ${financialValue(row)} estimated`,
      type: value.lane,
      open: () => open(row),
      ...tooltip(
        title(row),
        [
          { l: row.title, v: dayText(row) },
          { l: financialLabel(row), v: financialValue(row) },
          ...(value.lane === "z"
            ? [
                {
                  l: "Missed sales to date (est.)",
                  v: money(value.retrospective_amount),
                },
                {
                  l: "Forward exposure (est.)",
                  v: money(value.forward_amount),
                },
              ]
            : []),
          {
            l: "Valued stores",
            v: `${value.valued_count} / ${value.member_count}`,
          },
        ],
        "Dot size reflects dollars; dots are packed within weekly buckets, not exact dates. " +
          current.exposure.limitation,
      ),
      style: css(
        `position:absolute;border-radius:999px;width:${size}px;height:${size}px;left:calc(${x}% - ${size / 2}px);top:${lane * laneHeight + 25 + Math.floor(index / 4) * 36 - size / 2}px;background:${value.amount === null ? "#fff" : ["#d92d20", "#e8890c", "#0a7aff"][bucket]};border:${value.amount === null ? "2px dashed #75756f" : "3px solid #fff"};box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:pointer`,
      ),
    };
  });
  if (active)
    v.hero = {
      name: title(active),
      type: active.title,
      score: "Evidence",
      story: [{ t: financialStory(active) }],
      usd: financialValue(active),
      usdLabel: financialLabel(active),
      days: dayText(active),
      daysStyle: css(
        "font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1.1;color:#1d1d1f",
      ),
      open: () => open(active),
      scoreEnter: publishedOrder.enter,
      leave: publishedOrder.leave,
      usdEnter: tooltip(
        valueLabel(active),
        [{ l: "Basis", v: words(active.units_basis) }],
        active.limitations.join(" "),
      ).enter,
    };
  else
    v.hero = {
      ...v.hero,
      name: "No matching findings",
      type: "Not a health rating",
      story: [
        {
          t: "No finding qualifies for this filter. Explore the catalog to inspect actual metrics.",
        },
      ],
    };
  v.rows = groups.flatMap((group) =>
    group.visible
      .filter((value) => value.finding_id !== active?.finding_id)
      .map((value, index) => {
        const row = byId.get(value.finding_id)!;
        return {
          section:
            index === 0 ? `${group.label} · estimated dollars ↓` : undefined,
          sectionStyle: css(
            "padding:10px 20px;background:#f7f7f5;border-bottom:1px solid #e9e9e6;font-size:12px;font-weight:700;color:#55554f",
          ),
          rank: "•",
          name: title(row),
          type: row.title,
          days: dayText(row),
          usd: financialValue(row),
          open: () => open(row),
          ...tooltip(
            title(row),
            [
              { l: "Stores", v: number(row.affected_store_count) },
              { l: "Basis", v: financialLabel(row) },
            ],
            row.interpretation,
          ),
          style: css(
            "display:grid;grid-template-columns:24px minmax(0,1fr) 16px 44px 70px 16px;gap:10px;align-items:center;padding:10px 20px;cursor:pointer;border-bottom:1px solid #e9e9e6;background:#fff",
          ),
          daysStyle: css("font-size:14px;font-weight:700"),
          dotStyle: css(
            `display:block;width:9px;height:9px;border-radius:50%;background:${notes[row.finding_id] ? statusDots[notes[row.finding_id].status] : "transparent"}`,
          ),
        };
      }),
  );
  v.tracked = current.findings
    .filter((row) => notes[row.finding_id])
    .map((row) => {
      const note = notes[row.finding_id];
      return {
        name: title(row),
        action: note.name,
        check: checkInDate(current.metadata.observation_date),
        status: note.status,
        open: () => open(row),
        next: (event) => {
          event.stopPropagation();
          saveNote(row.finding_id, {
            ...note,
            status:
              statusOrder[
                (statusOrder.indexOf(note.status) + 1) % statusOrder.length
              ],
          });
        },
        chip: css(
          `height:22px;padding:0 9px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;color:${statusColors[note.status][0]};background:${statusColors[note.status][1]}`,
        ),
      };
    });
  v.noTracked = !v.tracked.length;

  const latest = (id: string) =>
    current.periods
      .filter((row) => row.product_id === id)
      .sort((a, b) => b.period_start.localeCompare(a.period_start))[0];
  v.xg = [
    ["sku", "SKU"],
    ["region", "Region"],
    ["format", "Format"],
  ].map(([key, label]) => ({
    label,
    go: () => setGroup(key),
    style: chip(group === key),
  }));
  v.xf = [
    ["all", "All"],
    ["flag", "Flagged"],
    ["ok", "No finding"],
    ["data", "Needs data"],
  ].map(([key, label]) => ({
    label,
    go: () => setExploreFilter(key),
    style: chip(exploreFilter === key),
  }));
  const catalogRows: Tile[] = current.metadata.items
    .map((item): Tile | null => {
      const metric = latest(item.product_id),
        dist = current.distribution.find(
          (row) => row.product_id === item.product_id,
        ),
        fs = current.findings.filter(
          (row) => row.product_id === item.product_id,
        );
      const state =
        !metric ||
        metric.sales_coverage === null ||
        metric.sales_coverage < current.metadata.configuration.minimum_coverage
          ? "data"
          : fs.length
            ? "flag"
            : "ok";
      if (exploreFilter !== "all" && exploreFilter !== state) return null;
      const series = current.periods
        .filter((row) => row.product_id === item.product_id)
        .sort((a, b) => a.period_start.localeCompare(b.period_start));
      const spark = chartPicture(
        series.map((row) => ({
          date: row.period_start,
          phase: "actual",
          units: row.units_store_week,
          dollars: null,
          firm: null,
          conditional: null,
          receipts: null,
          planned: null,
          zeros: null,
        })),
        "sales",
      );
      return {
        name: item.product_name,
        sub: item.source_product_id,
        inst: percent(metric?.in_stock_rate),
        dist:
          dist && dist.promised_stores
            ? percent(dist.stocked_stores / dist.promised_stores)
            : "Unavailable",
        vf:
          metric?.trend_pct == null
            ? "Unavailable"
            : `${number(metric.trend_pct)}%`,
        status:
          state === "flag"
            ? `${fs.length} findings`
            : state === "data"
              ? "Needs data"
              : "No finding",
        go: () => openItem(item.product_id),
        spark: {
          ...spark,
          position: "static",
          display: "block",
          width: 60,
          height: 20,
        },
        chip: css(
          "justify-self:end;font-size:12px;padding:3px 10px;border-radius:999px;color:#55554f;background:#f0f0ee",
        ),
        ...tooltip(
          item.product_name,
          [
            { l: "U/store/week", v: number(metric?.units_store_week) },
            { l: "$/store/week", v: money(metric?.dollars_store_week ?? null) },
            { l: "Sales coverage", v: percent(metric?.sales_coverage) },
            { l: "Inventory coverage", v: percent(metric?.inventory_coverage) },
          ],
          "Completed-week metrics. Stocked is current positive inventory among due promised stores. WoW is same-store velocity, not historical forecast accuracy.",
        ),
      };
    })
    .filter((row): row is Tile => row !== null);
  if (group === "sku") v.xrows = catalogRows;
  else if (group === "format")
    v.xrows = [
      {
        name: "Store format",
        sub: "Not published in this metric contract",
        inst: "Unavailable",
        dist: "Unavailable",
        vf: "Unavailable",
        status: "Needs data",
        chip: chip(false),
      },
    ];
  else if (!regional)
    v.xrows = [
      {
        name: "Loading published regional metrics…",
        inst: "—",
        dist: "—",
        vf: "—",
        status: "Loading",
      },
    ];
  else {
    const last = regional
      .map((row) => row.period_start)
      .sort()
      .at(-1);
    const regions = [...new Set(regional.map((row) => row.scope_name))];
    v.xrows = regions.map((region) => {
      const rows = regional.filter(
          (row) => row.scope_name === region && row.period_start === last,
        ),
        valid = rows.every((row) => row.in_stock_rate !== null),
        inventoryDays = rows.reduce((sum, row) => sum + row.inventory_days, 0),
        zeroDays = rows.reduce((sum, row) => sum + row.zero_days, 0);
      return {
        name: region,
        sub: `${rows.length} item rollups · ${last ?? ""}`,
        inst:
          valid && inventoryDays
            ? percent(1 - zeroDays / inventoryDays)
            : "Unavailable",
        dist: "Item-specific",
        vf: "Item-specific",
        status: "Published",
        chip: chip(false),
        isOpen: true,
        items: rows.map((row) => ({
          name:
            row.scope_name +
            " · " +
            (current.metadata.items.find(
              (item) => item.product_id === row.product_id,
            )?.product_name ?? row.product_id),
          type: `${number(row.units_store_week)} U/store/week`,
          days: percent(row.sales_coverage),
          open: () => openItem(row.product_id),
        })),
      };
    });
  }
  v.noX = !v.xrows.length;

  const growth = current.findings.filter((row) => row.promise === "expansion");
  v.xcase = {
    sub: `Published through ${current.metadata.observation_date}`,
    story: `${growth.length} item/issue findings show sustained same-store outperformance in two 14-day windows against the preceding 28-day internal baseline. This is not a peer/category benchmark, buyer approval or causal lift.`,
    scale: [
      {
        label: "Internal baseline",
        style: css("flex:1;font-size:11px;text-align:center"),
        bar: css("flex:1;height:6px;border-radius:999px;background:#0a7aff"),
      },
    ],
    chapters: growth.map((row) => ({
      week: title(row),
      mark: "✓",
      h: row.title,
      markStyle: css("color:#0a7aff"),
      chips: [
        { t: `${row.affected_store_count} qualifying stores` },
        { t: `${number(row.units)} incremental fulfilled units` },
      ],
    })),
    skus: growth.map((row) => ({
      name: title(row),
      v: `${row.affected_store_count} stores`,
      st: "Internal evidence",
      open: () => {
        setModal(null);
        open(row);
      },
      dots: [],
      vStyle: css("font-weight:700;text-align:right"),
      stStyle: chip(false),
    })),
    evidence: [
      {
        m: "✓",
        t: "Both recent windows meet the published materiality and exposure gates.",
        mStyle: css("color:#0a7aff"),
      },
      {
        m: "!",
        t: "Review seasonality and promotions. Category comparisons and expansion authorization remain unavailable.",
        mStyle: css("color:#b86a00"),
      },
    ],
  };
  const reportPeriods = current.periods.map((row) => row.period_start).sort();
  const growthItem = growth[0]?.product_id;
  const growthPeriods = current.periods
    .filter((row) => row.product_id === growthItem)
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .slice(-8);
  if (growthPeriods.length) {
    v.gc.bg = chartPicture(
      growthPeriods.map((row) => ({
        date: row.period_start,
        phase: "actual",
        units: row.units_store_week,
        dollars: row.dollars_store_week,
        firm: null,
        conditional: null,
        receipts: null,
        planned: null,
        zeros: null,
      })),
      "sales",
    );
    v.gc.labels = growthPeriods.map((row, index) => ({
      t: row.period_start.slice(5),
      style: css(
        `position:absolute;top:264px;left:${((index + 0.5) / growthPeriods.length) * 100}%;transform:translateX(-50%);font-size:11px;color:#75756f`,
      ),
    }));
    v.xcase.story += ` The chart shows actual item-wide U/store/week for ${current.metadata.items.find((row) => row.product_id === growthItem)?.product_name ?? growthItem}; it is not a peer or affected-cohort comparison.`;
    v.gmove = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setHover(
        Math.max(
          0,
          Math.min(
            growthPeriods.length - 1,
            Math.floor(
              ((event.clientX - rect.left) / rect.width) * growthPeriods.length,
            ),
          ),
        ),
      );
    };
    v.gleave = () => setHover(undefined);
    if (hover !== undefined && growthPeriods[hover]) {
      const row = growthPeriods[hover];
      v.gc.hasHover = true;
      v.gc.popDate = row.period_start;
      v.gc.popRows = [
        { l: "Actual U/store/week", v: number(row.units_store_week) },
        { l: "Actual $/store/week", v: money(row.dollars_store_week) },
      ];
      v.gc.pop = css(
        "position:absolute;top:20px;left:10px;z-index:6;width:190px;padding:10px 12px;border-radius:12px;background:#1d1d1f;color:#fff;pointer-events:none",
      );
    }
  }
  const reportStart = reportPeriods.at(-1) ?? "Unavailable";
  v.rp = {
    range: `Closed week ${reportStart}`,
    headline: `${current.findings.length} item/issue findings. Amounts and store counts may overlap; no combined impact, realized lost sales or measured action savings are claimed.`,
    secs: [
      {
        n: "01",
        title: "Availability",
        stats: [
          {
            label: "Current zero-inventory findings",
            val: String(
              current.findings.filter((row) => kinds(row) === "z").length,
            ),
            delta: "Observed, not a shelf audit",
          },
          {
            label: "Gap remains under plans",
            val: String(
              current.findings.filter(
                (row) => row.finding_code === "future_supply_gap",
              ).length,
            ),
            delta: "Conditional projection",
          },
          {
            label: "Dependent on planned orders",
            val: String(
              current.findings.filter(
                (row) => row.finding_code === "conditional_plan_dependency",
              ).length,
            ),
            delta: "Not an unavoidable stockout",
          },
        ],
      },
      {
        n: "02",
        title: "Inventory",
        stats: [
          {
            label: "Excess findings",
            val: String(
              current.findings.filter((row) => row.promise === "excess").length,
            ),
            delta: "Firm and conditional bases stay separate",
          },
          {
            label: "Carrying cost",
            val: "See each finding",
            delta: "Requires an approved rate",
          },
        ],
      },
      {
        n: "03",
        title: "Growth",
        stats: [
          {
            label: "Expansion evidence",
            val: String(growth.length),
            delta: "Same-store internal history",
          },
        ],
      },
    ],
    decisions: Object.entries(notes).map(([id, note]) => ({
      name: current.findings.find((row) => row.finding_id === id)
        ? title(current.findings.find((row) => row.finding_id === id)!)
        : id,
      sub: `${note.name} · ${note.status} · tab-only demo note`,
      result: "Not measured",
      mark: "◷",
      vStyle: css("color:#75756f"),
    })),
  };
  const downloadText = (name: string, rows: unknown[][]) => {
    const text = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const link = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }),
      );
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const reportExport = () =>
    downloadText("published-findings.csv", [
      [
        "release_id",
        "finding_id",
        "item",
        "code",
        "stores",
        "units_basis",
        "units",
        "retail_exposure",
        "inventory_capital",
        "carrying_cost_28d",
        "interpretation",
        "limitations",
      ],
      ...current.findings.map((row) => [
        release,
        row.finding_id,
        title(row),
        row.finding_code,
        row.affected_store_count,
        row.units_basis,
        row.units,
        row.retail_exposure_amount,
        row.inventory_capital_amount,
        row.carrying_cost_28d_amount,
        row.interpretation,
        row.limitations,
      ]),
    ]);
  v.exportRep = reportExport;
  v.exportG = reportExport;
  if (view !== "case" || !item) return v;
  const info = detail?.identity === identity ? detail : undefined;
  const err =
    detailFailure?.identity === identity ? detailFailure.message : null;
  const layer = params.get("layer") === "details" ? 3 : 1;
  v.l1 = layer === 1;
  v.l3 = layer === 3;
  v.showStoryCard = layer !== 3 || !finding;
  v.layers = [
    {
      label: "Story",
      style: chip(layer === 1),
      go: () => change({ layer: "story" }),
    },
    {
      label: "Details",
      style: chip(layer === 3),
      go: () => change({ layer: "details" }),
    },
  ];
  v.c = {
    name: item.product_name,
    type: finding?.title ?? "Published item metrics · not a health rating",
    score: "Evidence",
    story: [
      {
        t:
          err ??
          (info
            ? (finding?.interpretation ??
              "This catalog item can have several findings. Absence of a finding is not proof of healthy coverage.")
            : "Loading complete release-matched evidence…"),
      },
    ],
    storyStyle: css(
      `line-height:${layer === 1 ? 31 : 24}px;color:#2b2b28;text-wrap:pretty;font-size:${layer === 1 ? 21 : 15}px;font-weight:${layer === 1 ? 500 : 400};letter-spacing:-.005em`,
    ),
    after: notice,
    scoreEnter: publishedOrder.enter,
    leave: publishedOrder.leave,
  };
  if (!info) {
    v.why = [{ l: "Evidence status", v: err ?? "Loading…" }];
    return v;
  }
  const evidence = info.evidence,
    weekRows = chartWeeks(info.series),
    metric = latest(item.product_id);
  const missing = finding?.missing_evidence ?? [];
  const actions = demoActions(
    finding,
    checkInDate(current.metadata.observation_date),
  );
  v.hasActions = actions.length > 0;
  v.isA =
    !!finding &&
    ["future_supply_gap", "conditional_plan_dependency"].includes(
      finding.finding_code,
    );
  v.isZ = !!finding && kinds(finding) === "z";
  v.notZ = !v.isZ;
  v.isI = finding?.promise === "excess";
  const calculated = caseMetrics(finding, evidence, info.series);
  const caseValue = info.attention?.rows[0];
  if (
    finding &&
    info.attention &&
    caseValue &&
    valuations.has(finding.finding_id)
  ) {
    v.detailData = {
      finding,
      evidence,
      series: info.series,
      attention: info.attention,
      queue: valuations.get(finding.finding_id)!,
    };
  }
  const memberValues = new Map(
    caseValue?.members?.map((row) => [row.location_id, row]) ?? [],
  );
  if (caseValue?.lane === "z") {
    const baseline = sums(
      caseValue.members?.map((row) => row.baseline_daily_retail) ?? [],
    );
    calculated.metrics[0] = {
      label: "estimated missed sales + exposure",
      val: attentionDollars(caseValue),
    };
    calculated.why.push(
      {
        l: "Daily sales baseline",
        v: baseline === null ? "Unavailable" : `${compactMoney(baseline)}/day`,
        s: "Affected stores · in-stock sales or retailer forecast proxy",
      },
      {
        l: "Missed sales to date (est.)",
        v: compactMoney(caseValue.retrospective_amount),
        s: "Daily baseline × days at zero, less recorded sales",
      },
      {
        l: "Forward exposure (est.)",
        v: compactMoney(caseValue.forward_amount),
        s: caseValue.assumed_receipt_stores
          ? `Walmart forecast · ${info.attention!.assumptions.replenishment_days}-day assumed replenishment where no firm receipt exists`
          : "Walmart forecast until firm replenishment",
      },
    );
  }
  if (finding && (v.isA || v.isI || v.isZ))
    v.c.story = [{ t: financialStory(finding) }];
  v.metrics = calculated.metrics;
  v.why = conciseStoryWhy(finding, calculated.why);
  v.evid = [
    ...(caseValue
      ? [
          { l: "Valuation model", v: info.attention!.model_version },
          { l: "Valuation limits", v: info.attention!.limitation },
        ]
      : []),
    { l: "Release", v: release },
    { l: "Observed through", v: current.metadata.observation_date },
    {
      l: "Source",
      v: "Published retailer metrics, dated firm orders and separate planned supply",
    },
    { l: "Scope", v: info.series.scope },
    {
      l: "Completeness",
      v: `${info.series.member_count} members; incomplete aggregate evidence is unavailable, not zero`,
    },
    {
      l: "Limits",
      v: [info.series.limitation, ...(finding?.limitations ?? [])].join(" "),
    },
    {
      l: "Unverified",
      v: missing.length
        ? missing.map(words).join(" · ")
        : "No missing fields declared by this finding rule; action feasibility is not established.",
    },
  ];
  v.asks = [
    {
      label: "Why now?",
      style: chip(false),
      go: () =>
        setAsk(
          finding?.interpretation ??
            "Completed-week actual metrics, not an action recommendation.",
        ),
    },
    {
      label: "If I wait?",
      style: chip(false),
      go: () =>
        setAsk(
          "The firm and conditional projections describe unchanged-demand scenarios, not causal consequences of waiting. Action feasibility, lost sales and benefits are not established.",
        ),
    },
  ];
  v.askText = ask;
  const target = sums(
      evidence.map((row) =>
        explicit(row.facts.excess_calculation?.target_units),
      ),
    ),
    firmEnd = sums(evidence.map((row) => row.facts.firm_ending_units));
  if (v.isI && target !== null && firmEnd !== null) {
    const maximum = Math.max(1, target, firmEnd),
      pos = (value: number) => `${(Math.max(0, value) / maximum) * 100}%`;
    v.vis.need = css(
      `position:absolute;top:0;bottom:0;left:0;width:${pos(Math.min(target, firmEnd))};background:#0a7aff`,
    );
    v.vis.excess = css(
      `position:absolute;top:0;bottom:0;left:${pos(target)};width:${pos(Math.max(0, firmEnd - target))};background:#e8890c`,
    );
    v.vis.freed = { display: "none" };
    v.vis.lblNeed = css(
      "position:absolute;top:28px;left:0;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#55554f",
    );
    v.vis.lblExcess = css(
      "position:absolute;top:28px;right:0;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-size:12px;color:#e8890c",
    );
    v.vis.tick = css(
      `position:absolute;top:44px;height:56px;border-left:2px solid #1d1d1f;left:${pos(target)}`,
    );
  }
  if (
    v.isA &&
    info.series.projections
      .filter((row) => row.basis === "firm")
      .every((row) => row.unfulfilled_units !== null)
  ) {
    const rows = info.series.projections.filter((row) => row.basis === "firm"),
      first = rows.findIndex(
        (row) => row.unfulfilled_units !== null && row.unfulfilled_units > 0,
      );
    const end =
      first < 0
        ? -1
        : rows.findIndex(
            (row, index) => index > first && row.unfulfilled_units === 0,
          );
    const start = first < 0 ? 28 : first,
      stop = end < 0 ? 28 : end;
    v.vis.stock = css(
      `position:absolute;top:0;bottom:0;left:0;width:${(start / 28) * 100}%;background:#0a7aff`,
    );
    v.vis.gap = css(
      `position:absolute;top:0;bottom:0;left:${(start / 28) * 100}%;width:${((stop - start) / 28) * 100}%;background:#f4b9b3`,
    );
    v.vis.low = { display: "none" };
    v.vis.saved = { display: "none" };
    v.vis.restock = css(
      `position:absolute;top:0;bottom:0;left:${(stop / 28) * 100}%;right:0;background:#e9e9e6`,
    );
    v.vis.lblStock = css(
      `position:absolute;top:34px;left:0;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#55554f;display:${start > 0 ? "block" : "none"}`,
    );
    v.vis.lblGap = css(
      `position:absolute;top:34px;right:0;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-size:12px;color:#d92d20;display:${stop > start ? "block" : "none"}`,
    );
    v.vis.cap =
      "First projected shortfall with firm supply only. Planned orders may cover it if they arrive; action effects are not modeled.";
    v.vis.ticks = [0, 7, 14, 21, 28].map((day) => ({
      l: `${day}d`,
      style: css(
        `position:absolute;top:128px;left:${(day / 28) * 100}%;transform:translateX(${day === 0 ? "0" : day === 28 ? "-100%" : "-50%"});font-size:11px;color:#75756f`,
      ),
    }));
    v.vis.weeks = [7, 14, 21].map((day) => ({
      style: css(
        `position:absolute;top:0;bottom:0;left:${(day / 28) * 100}%;width:2px;background:#fff`,
      ),
    }));
  }
  if (v.isZ) {
    const n = finding!.affected_store_count,
      total = finding!.eligible_store_count;
    v.zbar = {
      head: `${total} eligible stores; ${n} members of this specific finding`,
      a: css(
        `height:100%;width:${(n / Math.max(1, total)) * 100}%;background:#d92d20`,
      ),
      b: { display: "none" },
      c: css("height:100%;flex:1;background:#e9e9e6"),
      la: `${n} finding stores`,
      lb: "",
      lc: "Other eligible stores—not classified by this finding",
    };
    v.zrows = evidence.map((row) => ({
      name: row.facts.store_name,
      region: row.facts.region ?? "Unknown",
      status:
        finding!.finding_code === "promised_distribution_gap"
          ? "No earlier positive stock observed"
          : "Previously positive, now reported zero",
      days: number(row.facts.consecutive_zero_days),
      dem: number(row.facts.firm_unfulfilled_units),
      sStyle: css("font-size:12px;color:#55554f"),
      dStyle: css("text-align:right"),
    }));
    v.zfilter = [
      { label: `All ${evidence.length} members`, style: chip(true) },
    ];
    v.zex = [calculated.metrics[0], calculated.metrics[2]];
  }
  const selectedKey =
    chosen?.identity === identity
      ? chosen.key
      : notes[finding?.finding_id ?? ""]?.option;
  const option = actions.find((row) => row.key === selectedKey);
  if (option)
    v.c.after =
      option.key === "Watch"
        ? `Watch · check-in ${checkInDate(current.metadata.observation_date)}`
        : `${option.label} selected · timing and benefit not modeled`;
  v.actions = actions.map((row) => ({
    name: row.label,
    sub: row.sub,
    eff: "—",
    go: () => {
      setChosen({ identity, key: selectedKey === row.key ? "" : row.key });
      setShareText(undefined);
      setTip(undefined);
    },
    style: css(
      `display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;transition:all .15s;border:1px solid ${selectedKey === row.key ? "#1d1d1f" : "#d6d6d2"};background:${selectedKey === row.key ? "#1d1d1f" : "#fff"};color:${selectedKey === row.key ? "#fff" : "#1d1d1f"}`,
    ),
    subStyle: css(
      `font-size:12px;font-style:italic;color:${selectedKey === row.key ? "#c4c4bf" : "#75756f"}`,
    ),
    effStyle: css(
      `font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:${row.key === "Watch" ? "#75756f" : selectedKey === row.key ? "#5ad08a" : "#1f9d55"}`,
    ),
  }));
  const exporter = () => {
    if (finding) {
      try {
        downloadEvidence(
          release!,
          finding,
          evidence,
          caseValue?.members
            ? {
                model_version: info.attention!.model_version,
                assumptions: info.attention!.assumptions,
                members: caseValue.members,
              }
            : undefined,
        );
        setNotice("Complete evidence exported. No order or approval changed.");
      } catch {
        setNotice("Export failed; no partial evidence downloaded.");
      }
    } else
      downloadText(`${item.source_product_id}-weekly.csv`, [
        [
          "release",
          "product",
          "week_start",
          "week_end",
          "units",
          "retail_sales",
          "units_store_week",
          "dollars_store_week",
          "sales_coverage",
          "inventory_coverage",
        ],
        ...current.periods
          .filter((row) => row.product_id === item.product_id)
          .map((row) => [
            release,
            item.product_id,
            row.period_start,
            row.period_end,
            row.units,
            row.dollars,
            row.units_store_week,
            row.dollars_store_week,
            row.sales_coverage,
            row.inventory_coverage,
          ]),
      ]);
  };
  v.exportXlsx = exporter;
  v.commit = () => {
    if (!finding || !option) return;
    const text =
      shareText ??
      (notes[finding.finding_id]?.option === option.key
        ? notes[finding.finding_id].text
        : `${finding.interpretation} Proposed action: ${option.label}. ${option.key === "Watch" ? `Check-in ${checkInDate(current.metadata.observation_date)}.` : "Timing and benefit not modeled."}`);
    saveNote(finding.finding_id, {
      name: option.label,
      option: option.key,
      status:
        notes[finding.finding_id]?.option === option.key
          ? notes[finding.finding_id].status
          : "proposed",
      owner,
      text,
    });
    setShareText(text);
    generatePreview(text, owner);
    setModal("share");
  };
  v.commitLabel = !option
    ? "✓"
    : notes[finding?.finding_id ?? ""]?.option === option.key
      ? "↗ Share"
      : notes[finding?.finding_id ?? ""]
        ? "✓ Update & share"
        : "✓ Commit & share";
  v.commitStyle = css(
    `height:44px;border-radius:12px;font-size:15px;font-weight:700;background:${option ? "#1d1d1f" : "#d6d6d2"};color:#fff;cursor:${option ? "pointer" : "not-allowed"}`,
  );
  v.tracked1 =
    finding && notes[finding.finding_id]
      ? `${notes[finding.finding_id].name} · ${notes[finding.finding_id].status} · check-in ${checkInDate(current.metadata.observation_date)}`
      : "";
  v.shName = item.product_name;
  v.shText =
    shareText ??
    notes[finding?.finding_id ?? ""]?.text ??
    finding?.interpretation ??
    "";
  const generatePreview = (text: string, to: string) => {
    try {
      const image = onePager({
        name: item.product_name,
        type: finding?.title ?? "Published metrics",
        to,
        text,
        metrics: calculated.metrics.map((row) => ({
          value: row.val ?? "Unavailable",
          label: row.label ?? "Published metric",
        })),
        weeks: weekRows,
        stores: v.storeRows,
        observed: current.metadata.observation_date,
      });
      const value = { ...image, identity };
      setRenderedPreview(value);
      return value;
    } catch {
      setNotice(
        "PNG preview unavailable. Complete CSV evidence remains available.",
      );
      return undefined;
    }
  };
  v.shEdit = (event) => {
    setShareText(event.target.value);
    generatePreview(event.target.value, owner);
  };
  v.shTo = ["Buyer", "Planner", "Logistics"].map((label) => ({
    label,
    style: chip(owner === label),
    go: () => {
      setOwner(label);
      if (finding && notes[finding.finding_id])
        saveNote(finding.finding_id, {
          ...notes[finding.finding_id],
          owner: label,
        });
      generatePreview(v.shText, label);
    },
  }));
  const preview =
    renderedPreview?.identity === identity ? renderedPreview : undefined;
  v.shPngStyle = css(
    "width:100%;border-radius:8px;background-size:100% 100%;background-repeat:no-repeat",
  );
  v.shPngStyle.aspectRatio = String(preview?.ratio ?? 1.4);
  if (preview) v.shPngStyle.backgroundImage = 'url("' + preview.url + '")';
  v.shSave = () => {
    const image = preview ?? generatePreview(v.shText, owner);
    if (!image) return;
    const link = document.createElement("a");
    link.href = image.url;
    link.download = item.source_product_id + "-evidence-summary.png";
    link.click();
    setNotice(
      "PNG summary prepared. This is not an approval or a measured action result.",
    );
  };
  v.showChart = mode !== "stores";
  v.showStores = mode === "stores";
  v.modes = [
    ["sales", "Sales"],
    ["stock", "Inventory"],
    ["stores", "Stores"],
  ].map(([key, label]) => ({
    label,
    go: () => setMode(key as "sales" | "stock" | "stores"),
    style: chip(mode === key),
  }));
  v.map.chartStyle = chartPicture(
    weekRows,
    mode === "stock" ? "stock" : "sales",
  );
  const past = weekRows.filter((row) => row.phase === "actual").length;
  v.map.nowStyle = css(
    `position:absolute;top:0;height:260px;border-left:1px dashed #a6a6a0;left:${(past / Math.max(1, weekRows.length)) * 100}%;pointer-events:none`,
  );
  v.map.labels = weekRows.map((row, index) => ({
    t: row.date.slice(5),
    style: css(
      `position:absolute;top:264px;left:${((index + 0.5) / Math.max(1, weekRows.length)) * 100}%;transform:translateX(-50%);font-size:11px;color:#75756f`,
    ),
  }));
  v.map.move = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover(
      Math.min(
        weekRows.length - 1,
        Math.max(
          0,
          Math.floor(
            ((event.clientX - rect.left) / rect.width) * weekRows.length,
          ),
        ),
      ),
    );
  };
  v.map.leave = () => setHover(undefined);
  if (hover !== undefined && weekRows[hover]) {
    const row = weekRows[hover];
    v.map.hasHover = true;
    v.map.popDate = `${row.phase} · ${row.date}`;
    v.map.popRows =
      mode === "stock"
        ? [
            { l: "Firm ending", v: number(row.firm) },
            { l: "Conditional ending", v: number(row.conditional) },
          ]
        : [
            {
              l: row.phase === "actual" ? "Fulfilled units" : "Forecast demand",
              v: number(row.units),
            },
          ];
    v.map.popStyle = css(
      "position:absolute;top:20px;left:10px;z-index:6;width:190px;padding:10px 12px;border-radius:12px;background:#1d1d1f;color:#fff;pointer-events:none",
    );
    v.map.scrubStyle = css(
      `position:absolute;top:0;height:260px;width:1px;background:#1d1d1f;opacity:.28;left:${((hover + 0.5) / Math.max(1, weekRows.length)) * 100}%;pointer-events:none`,
    );
  }
  v.storeHead =
    finding?.promise === "excess"
      ? "Excess units at horizon"
      : "Firm unmet units · 28d";
  const stores = evidence.slice(0, 8);
  v.storeRows = stores.map((row) => ({
    name: row.facts.store_name,
    region: row.facts.region ?? "Unknown",
    label: number(
      finding?.promise === "excess"
        ? row.units
        : row.facts.firm_unfulfilled_units,
    ),
    bar: css(
      "display:block;height:100%;width:100%;border-radius:999px;background:#0a7aff",
    ),
    numStyle: css("font-size:14px;font-weight:700;text-align:right"),
    ...tooltip(
      row.facts.store_name,
      [
        ...(memberValues.has(row.location_id)
          ? [
              {
                l: "Estimated financial exposure",
                v: money(memberValues.get(row.location_id)!.amount),
              },
              {
                l: "In-stock sales baseline / day",
                v: money(
                  memberValues.get(row.location_id)!.baseline_daily_retail,
                ),
              },
              {
                l: "Baseline",
                v: words(memberValues.get(row.location_id)!.baseline_basis),
              },
              {
                l: "Replenishment",
                v: words(memberValues.get(row.location_id)!.receipt_basis),
              },
            ]
          : []),
        { l: "Reported on hand", v: number(row.facts.on_hand) },
        { l: "Firm unmet", v: number(row.facts.firm_unfulfilled_units) },
        {
          l: "Conditional unmet",
          v: number(row.facts.conditional_unfulfilled_units),
        },
        { l: "Source plan review", v: row.plan_review_date ?? "Unavailable" },
      ],
      row.missing_evidence.map(words).join("; "),
    ),
  }));
  v.moreStores =
    evidence.length > 8
      ? `+${evidence.length - 8} more · CSV includes every store`
      : "";
  if (!finding) {
    const members = info.series.members,
      maximum = Math.max(
        1,
        ...members.flatMap((row) =>
          row.on_hand === null ? [] : [row.on_hand],
        ),
      );
    v.storeHead = "Reported current on-hand units";
    v.storeRows = members.slice(0, 8).map((row) => ({
      name: row.location_name,
      region: row.region,
      label: number(row.on_hand),
      bar: css(
        `display:block;height:100%;width:${((row.on_hand ?? 0) / maximum) * 100}%;border-radius:999px;background:#0a7aff`,
      ),
      numStyle: css("font-size:14px;font-weight:700;text-align:right"),
      ...tooltip(
        row.location_name,
        [
          { l: "Reported on hand", v: number(row.on_hand) },
          { l: "State", v: words(row.current_state) },
        ],
        "Reported stock is not a shelf audit. Unknown is not zero.",
      ),
    }));
    v.moreStores =
      members.length > 8 ? `+${members.length - 8} more eligible stores` : "";
    v.metrics = [
      {
        label: "U/store/week",
        val: wholeUnits(metric?.units_store_week),
      },
      {
        label: "$/store/week",
        val: compactMoney(metric?.dollars_store_week ?? null),
      },
      {
        label: "reported in stock",
        val: percent(metric?.in_stock_rate),
      },
    ];
    v.why.push(
      { l: "Sales coverage", v: percent(metric?.sales_coverage) },
      { l: "Inventory coverage", v: percent(metric?.inventory_coverage) },
    );
    v.asks.push(
      ...current.findings
        .filter((row) => row.product_id === item.product_id)
        .map((row) => ({
          label: row.title,
          style: chip(false),
          go: () => open(row),
        })),
    );
  }
  const allPlans = evidence.flatMap((row) =>
    row.facts.plans.map((plan) => ({
      ...plan,
      location: row.facts.store_name,
    })),
  );
  v.cmts = [
    ...info.series.firm_orders.map((order) => ({
      name: order.retailer_order_id,
      sub: `${order.expected_store_receipt_date} · ${number(order.outstanding_units)} units · ${order.location_id}`,
      chip: "firm",
      chipStyle: chip(false),
    })),
    ...allPlans.map((plan) => ({
      name: plan.plan_id,
      sub: `${plan.order_place_dt} placement → ${plan.sched_arvl_dt} store arrival · ${number(plan.remaining_planned_qty)} units · ${plan.location}`,
      chip: plan.eligible_for_projection ? "conditional" : "excluded",
      chipStyle: chip(false),
    })),
  ].slice(0, 20);
  v.sup = [
    {
      l: "Firm unmet units",
      v: number(sums(evidence.map((row) => row.facts.firm_unfulfilled_units))),
      s: "28-day base projection",
    },
    {
      l: "Conditional unmet units",
      v: number(
        sums(evidence.map((row) => row.facts.conditional_unfulfilled_units)),
      ),
      s: "If eligible plans execute",
    },
  ];
  v.supNote =
    "Firm and conditional paths are alternatives. A plan is not a PO; stock readiness, placement and delivery are unverified.";
  v.arrScale = [0, 7, 14, 21, 28].map((day) => ({
    l: `${day}d`,
    style: css(
      `position:absolute;top:0;left:${(day / 28) * 100}%;font-size:11px;color:#75756f;transform:translateX(-50%)`,
    ),
  }));
  v.arrivals = info.series.firm_orders.map((order) => {
    const day =
      daysBetween(
        current.metadata.observation_date,
        order.expected_store_receipt_date,
      ) - 1;
    return {
      name: order.retailer_order_id,
      sub: `${order.expected_store_receipt_date} · ${number(order.outstanding_units)} units · firm scheduled`,
      bar: css(
        `position:absolute;top:4px;bottom:4px;left:${(Math.max(0, day) / 28) * 100}%;width:2px;background:#0a7aff`,
      ),
      tick: css(
        `position:absolute;top:0;bottom:0;left:${(Math.max(0, day) / 28) * 100}%;border-left:2px solid #1d1d1f`,
      ),
      ...tooltip(
        "Scheduled store receipt",
        [
          { l: "Date", v: order.expected_store_receipt_date },
          { l: "Units", v: number(order.outstanding_units) },
        ],
        "Scheduled, not a probabilistic arrival range or authorized expedite.",
      ),
    };
  });
  v.span = [
    ["past", "Past 8 wks"],
    ["next", "Next 4 wks"],
    ["both", "Both"],
  ].map(([key, label]) => ({
    label,
    go: () => setSpan(key),
    style: chip(span === key),
  }));
  v.tbl.head = [
    "Week of",
    "Sales / forecast units",
    "Firm receipts",
    "Firm ending stock",
    "Conditional ending stock",
  ].map((t, index) => ({
    t,
    style: css(
      `padding:12px 16px;font-size:12px;font-weight:600;color:#55554f;background:#f3f3f1;white-space:nowrap;text-align:${index ? "right" : "left"}`,
    ),
  }));
  v.tbl.rows = weekRows
    .filter(
      (row) =>
        span === "both" ||
        (span === "past" ? row.phase === "actual" : row.phase === "projected"),
    )
    .map((row) => ({
      tog: () => {},
      style: {},
      open: false,
      detail: [],
      cells: [
        `${row.date} · ${row.phase}`,
        number(row.units),
        number(row.receipts),
        number(row.firm),
        number(row.conditional),
      ].map((t, index) => ({
        t,
        style: css(
          `padding:12px 16px;border-top:1px solid #e9e9e6;text-align:${index ? "right" : "left"}`,
        ),
      })),
    }));
  return v;
}
