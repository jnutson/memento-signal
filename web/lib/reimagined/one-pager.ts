import type { Week } from "./data";
import type { Tile } from "./view-model";

// The supplied one-pager's canvas layout, palette, typography and spacing.
// Only its inputs change: published data replaces simulated curves/action benefits.
export function onePager(input: {
  name: string;
  type: string;
  to: string;
  text: string;
  metrics: { value: string; label: string }[];
  weeks: Week[];
  stores: Tile[];
  observed: string;
}) {
  const W = 1200,
    S = 2,
    cv = document.createElement("canvas"),
    ctx = cv.getContext("2d");
  if (!ctx) throw new Error("PNG canvas unavailable.");
  const F = (weight: number, size: number, italic = false) =>
    `${italic ? "italic " : ""}${weight} ${size}px Geist, -apple-system, "Segoe UI", sans-serif`;
  const wrap = (text: string, font: string, width: number) => {
    ctx.font = font;
    const rows: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        rows.push(line);
        line = word;
      } else line = next;
    }
    if (line) rows.push(line);
    return rows;
  };
  const lines = wrap(input.text, F(500, 21), W - 56 * 2 - 28).slice(0, 9);
  const ys = 146 + lines.length * 31 + 36,
    cy = ys + 90,
    ch = 250,
    H = cy + ch + 100;
  cv.width = W * S;
  cv.height = H * S;
  ctx.scale(S, S);
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  ctx.fillStyle = "#f7f7f5";
  ctx.fillRect(0, 0, W, H);
  rr(24, 24, W - 48, H - 48, 20);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#d6d6d2";
  ctx.lineWidth = 1;
  ctx.stroke();
  const L = 56,
    R = W - 56;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#1d1d1f";
  ctx.font = F(700, 32);
  ctx.fillText(input.name, L, 84);
  ctx.fillStyle = "#75756f";
  ctx.font = F(400, 16, true);
  ctx.fillText(input.type, L, 110);
  ctx.font = F(600, 14);
  const recipient = `For ${input.to}`,
    pw = ctx.measureText(recipient).width + 28;
  rr(R - pw, 58, pw, 30, 15);
  ctx.fillStyle = "#f0f0ee";
  ctx.fill();
  ctx.fillStyle = "#1d1d1f";
  ctx.fillText(recipient, R - pw + 14, 78);
  ctx.fillStyle = "#0a7aff";
  ctx.font = F(400, 20);
  ctx.fillText("✦", L, 168);
  ctx.fillStyle = "#2b2b28";
  ctx.font = F(500, 21);
  lines.forEach((line, index) => ctx.fillText(line, L + 28, 168 + index * 31));
  input.metrics.slice(0, 3).forEach((metric, index) => {
    const x = L + index * 300;
    ctx.fillStyle = "#0a5cc7";
    ctx.font = F(700, 38);
    ctx.fillText(metric.value, x, ys + 36);
    ctx.fillStyle = "#75756f";
    ctx.font = F(400, 14);
    ctx.fillText(metric.label, x, ys + 58);
  });
  const cx = L + 48,
    cw = 620,
    N = Math.max(1, input.weeks.length),
    values = input.weeks
      .flatMap((row) => [row.firm, row.conditional])
      .filter((value): value is number => value !== null),
    m0 = Math.max(1, ...values) * 1.08,
    e = Math.pow(10, Math.floor(Math.log10(m0))),
    m = m0 / e,
    ymax = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  const Y = (value: number) => cy + ch - (value / ymax) * ch,
    X = (i: number) => cx + ((i + 0.5) / N) * cw;
  ctx.font = F(400, 12);
  ctx.textAlign = "right";
  for (let k = 0; k <= 4; k++) {
    const value = (ymax * k) / 4;
    ctx.beginPath();
    ctx.moveTo(cx, Y(value));
    ctx.lineTo(cx + cw, Y(value));
    ctx.strokeStyle = k ? "#eeeeec" : "#d6d6d2";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#75756f";
    ctx.fillText(
      value >= 1000
        ? `${(value / 1000).toFixed(1)}k`
        : String(Math.round(value)),
      cx - 8,
      Y(value) + 4,
    );
  }
  const path = (
    field: "firm" | "conditional",
    phase: "actual" | "projected",
    color: string,
    dash: number[],
  ) => {
    ctx.beginPath();
    let drawing = false;
    input.weeks.forEach((row, i) => {
      const value = row[field];
      if (value === null || row.phase !== phase) {
        drawing = false;
        return;
      }
      if (drawing) ctx.lineTo(X(i), Y(value));
      else ctx.moveTo(X(i), Y(value));
      drawing = true;
    });
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.setLineDash([]);
  };
  path("firm", "actual", "#0a5cc7", []);
  path("firm", "projected", "#0a5cc7", [6, 5]);
  path("conditional", "projected", "#e8890c", [2, 4]);
  const past = input.weeks.filter((row) => row.phase === "actual").length;
  ctx.beginPath();
  ctx.moveTo(cx + (past / N) * cw, cy);
  ctx.lineTo(cx + (past / N) * cw, cy + ch);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "#a6a6a0";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#75756f";
  ctx.font = F(400, 12);
  ctx.textAlign = "center";
  input.weeks.forEach((row, i) => {
    if (i % 4 === 0 || i === input.weeks.length - 1)
      ctx.fillText(row.date, X(i), cy + ch + 20);
  });
  const rx = cx + cw + 44;
  ctx.textAlign = "left";
  ctx.font = F(400, 12, true);
  ctx.fillText("Stores · published evidence", rx, cy + 12);
  input.stores.slice(0, 6).forEach((store, i) => {
    const y = cy + 44 + i * 34;
    ctx.fillStyle = "#1d1d1f";
    ctx.font = F(600, 14);
    ctx.fillText(store.name ?? "", rx, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0a5cc7";
    ctx.font = F(700, 14);
    ctx.fillText(store.label ?? "Unavailable", R, y);
    ctx.textAlign = "left";
  });
  ctx.fillStyle = "#55554f";
  ctx.font = F(400, 13);
  ctx.fillText(
    "Blue: firm ending inventory. Orange: conditional plans. Gaps are unavailable evidence.",
    L,
    cy + ch + 52,
  );
  ctx.fillStyle = "#a6a6a0";
  ctx.font = F(400, 12);
  ctx.fillText(
    "Demo review only · No external approval or measured savings",
    L,
    cy + ch + 76,
  );
  ctx.textAlign = "right";
  ctx.fillText(`Signal · ${input.observed}`, R, cy + ch + 76);
  return { url: cv.toDataURL("image/png"), ratio: W / H };
}
