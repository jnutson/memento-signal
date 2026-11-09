import type {
  CSSProperties,
  MouseEventHandler,
  ChangeEventHandler,
  KeyboardEventHandler,
} from "react";
import type { DetailsInput } from "./details-model";

export type Go = MouseEventHandler<HTMLElement>;
export type Tile = {
  section?: string;
  sectionStyle?: CSSProperties;
  inst?: string;
  dist?: string;
  vf?: string;
  tag?: string;
  tick?: CSSProperties;
  name?: string;
  label?: string;
  type?: string;
  t?: string;
  l?: string;
  v?: string;
  s?: string;
  val?: string;
  sub?: string;
  rank?: string;
  days?: string;
  usd?: string;
  status?: string;
  action?: string;
  check?: string;
  title?: string;
  delta?: string;
  result?: string;
  mark?: string;
  week?: string;
  h?: string;
  m?: string;
  dem?: string;
  region?: string;
  eff?: string;
  st?: string;
  n?: string;
  a?: string;
  b?: string;
  style?: CSSProperties;
  bar?: CSSProperties;
  dot?: CSSProperties;
  dotStyle?: CSSProperties;
  daysStyle?: CSSProperties;
  chip?: CSSProperties;
  chipStyle?: CSSProperties;
  subStyle?: CSSProperties;
  effStyle?: CSSProperties;
  instStyle?: CSSProperties;
  vfStyle?: CSSProperties;
  mStyle?: CSSProperties;
  vStyle?: CSSProperties;
  stStyle?: CSSProperties;
  deltaStyle?: CSSProperties;
  dStyle?: CSSProperties;
  sStyle?: CSSProperties;
  numStyle?: CSSProperties;
  spark?: CSSProperties;
  markStyle?: CSSProperties;
  ov?: CSSProperties;
  go?: Go;
  open?: Go;
  enter?: Go;
  leave?: Go;
  next?: Go;
  isOpen?: boolean;
  items?: Tile[];
  dots?: Tile[];
  chips?: Tile[];
  stats?: Tile[];
};
export const noop: Go = () => {};
const style = (): CSSProperties => ({});
const tiles = (): Tile[] => [];

// Presentation slots from the supplied render function, not an analytical model.
export function emptyView() {
  return {
    detailData: null as DetailsInput | null,
    home: true,
    isCase: false,
    vExplore: false,
    today: "",
    homeStyle: style(),
    nav: tiles(),
    goHome: noop,
    back: noop,
    search: "",
    sOpen: false,
    hasRecents: false,
    noResults: false,
    onSearch: (() => {}) as ChangeEventHandler<HTMLInputElement>,
    onFocus: () => {},
    onBlur: () => {},
    onKey: (() => {}) as KeyboardEventHandler<HTMLInputElement>,
    results: tiles(),
    recents: tiles(),
    openMap: noop,
    mapClose: noop,
    mapOpen: false,
    rep: false,
    repDot: false,
    openRep: noop,
    repClose: noop,
    xcOpen: false,
    openX: noop,
    xcClose: noop,
    stop: ((event) => event.stopPropagation()) as Go,
    brief: "Loading published evidence…",
    stats: tiles(),
    bands: tiles(),
    queueTypes: tiles(),
    queueLanes: tiles(),
    queueHeight: { height: "150px" } as CSSProperties,
    queuePlot: { position: "absolute", inset: "0 0 0 100px" } as CSSProperties,
    queueControls: {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      marginBottom: "8px",
    } as CSSProperties,
    dots: tiles(),
    rows: tiles(),
    tracked: tiles(),
    noTracked: true,
    hero: {
      name: "",
      type: "",
      score: "—",
      story: tiles(),
      usd: "—",
      usdLabel: "",
      days: "—",
      daysStyle: style(),
      open: noop,
      scoreEnter: noop,
      usdEnter: noop,
      leave: noop,
    },
    xg: tiles(),
    xf: tiles(),
    xrows: tiles(),
    noX: false,
    l1: true,
    l3: false,
    layers: tiles(),
    showStoryCard: true,
    hasActions: false,
    isA: false,
    isD: false,
    isI: false,
    isZ: false,
    notZ: true,
    c: {
      name: "",
      type: "",
      score: "—",
      story: tiles(),
      storyStyle: style(),
      after: "",
      scoreEnter: noop,
      leave: noop,
    },
    metrics: tiles(),
    why: tiles(),
    evid: tiles(),
    asks: tiles(),
    askText: "",
    zex: tiles(),
    zhist: tiles(),
    zfilter: tiles(),
    zrows: tiles(),
    zmore: "",
    zbar: {
      a: style(),
      b: style(),
      c: style(),
      head: "",
      la: "",
      lb: "",
      lc: "",
    },
    sup: tiles(),
    supNote: "",
    cmts: [] as (Omit<Tile, "chip"> & { chip: string })[],
    modes: tiles(),
    showChart: true,
    showStores: false,
    storeHead: "",
    storeRows: tiles(),
    moreStores: "",
    map: {
      chartStyle: style(),
      nowStyle: style(),
      bands: tiles(),
      labels: tiles(),
      dots: tiles(),
      flags: tiles(),
      marks: tiles(),
      hasHover: false,
      move: noop,
      leave: noop,
      popDate: "",
      popRows: tiles(),
      popStyle: style(),
      scrubStyle: style(),
    },
    span: tiles(),
    tbl: {
      head: tiles(),
      rows: [] as {
        tog: Go;
        style: CSSProperties;
        cells: Tile[];
        open: boolean;
        detail: { a: string; b: string }[];
      }[],
    },
    exportXlsx: noop,
    exportRep: noop,
    exportG: noop,
    arrScale: tiles(),
    arrivals: tiles(),
    carry: tiles(),
    actions: tiles(),
    commit: noop,
    commitLabel: "Download evidence",
    commitStyle: style(),
    tracked1: "",
    vis: {
      weeks: tiles(),
      ticks: tiles(),
      bars: tiles(),
      cap: "",
      capStyle: style(),
      hasMark: false,
      markLabel: "",
      stock: style(),
      low: style(),
      gap: style(),
      saved: style(),
      restock: style(),
      lblStock: style(),
      lblGap: style(),
      mark: style(),
      line: style(),
      lineLbl: style(),
      need: style(),
      excess: style(),
      freed: style(),
      lblNeed: style(),
      lblExcess: style(),
      tick: style(),
    },
    rp: { range: "", headline: "", secs: tiles(), decisions: tiles() },
    xcase: {
      sub: "",
      story: "",
      chapters: tiles(),
      skus: tiles(),
      evidence: tiles(),
      scale: tiles(),
    },
    gc: {
      bg: style(),
      labels: tiles(),
      hasHover: false,
      pop: style(),
      scrub: style(),
      popDate: "",
      popRows: tiles(),
    },
    gmove: noop,
    gleave: noop,
    sh: false,
    shClose: noop,
    shName: "",
    shText: "",
    shTo: tiles(),
    shPngStyle: style(),
    shEdit: (() => {}) as ChangeEventHandler<HTMLTextAreaElement>,
    shSave: noop,
    hasTip: false,
    tipStyle: style(),
    tipTitle: "",
    tipRows: tiles(),
    tipFoot: "",
  };
}
export type ViewModel = ReturnType<typeof emptyView>;
