import type { CSSProperties } from "react";
import type { Finding } from "@/lib/connected/schema";
import { number, money } from "@/lib/connected/presentation";
import type { Week } from "./data";

export { number, money };
export const compactMoney = (value: number | null | undefined) =>
  value == null
    ? "Unavailable"
    : Math.abs(value) >= 1000
      ? `$${(value / 1000).toFixed(1)}k`
      : `$${value.toFixed(0)}`;
export const wholeUnits = (value: number | null | undefined) =>
  value == null
    ? "Unavailable"
    : value.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const css = (value: string): CSSProperties =>
  Object.fromEntries(
    value
      .split(";")
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf(":");
        return [
          entry
            .slice(0, index)
            .trim()
            .replace(/-([a-z])/g, (_, char: string) => char.toUpperCase()),
          entry.slice(index + 1).trim(),
        ];
      }),
  );
export const chip = (on: boolean) =>
  css(
    `height:28px;padding:0 14px;border-radius:999px;border:1px solid ${on ? "#1d1d1f" : "#d6d6d2"};background:${on ? "#1d1d1f" : "#fff"};color:${on ? "#fff" : "#55554f"};font-size:13px;font-weight:600`,
  );
export const percent = (value: number | null | undefined) =>
  value == null ? "Unavailable" : `${number(value * 100)}%`;
export const valueFor = (finding: Finding) =>
  finding.promise === "excess"
    ? money(finding.inventory_capital_amount)
    : finding.promise === "expansion"
      ? `${number(finding.units)} units`
      : finding.retail_exposure_amount === null
        ? `${number(finding.affected_store_count)} stores`
        : money(finding.retail_exposure_amount);
export const valueLabel = (finding: Finding) =>
  finding.promise === "excess"
    ? "inventory capital exposure"
    : finding.promise === "expansion"
      ? "incremental actual units vs internal baseline"
      : finding.retail_exposure_amount === null
        ? "affected stores"
        : "projected retail exposure · 28d";
export const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86400000,
  );
export function chartPicture(weeks: Week[], mode: "sales" | "stock") {
  const values = weeks
    .flatMap((row) =>
      mode === "sales" ? [row.units] : [row.firm, row.conditional],
    )
    .filter((value): value is number => value !== null);
  const max = Math.max(1, ...values),
    n = Math.max(1, weeks.length),
    x = (i: number) => ((i + 0.5) / n) * 600,
    y = (v: number) => 250 - (v / max) * 235;
  const path = (
    field: "units" | "firm" | "conditional",
    phase: "actual" | "projected",
  ) => {
    let active = false;
    return weeks
      .map((row, i) => {
        const value = row[field];
        if (row.phase !== phase || value === null) {
          active = false;
          return "";
        }
        const command = active ? "L" : "M";
        active = true;
        return `${command}${x(i).toFixed(2)} ${y(value).toFixed(2)}`;
      })
      .join(" ");
  };
  const field = mode === "sales" ? "units" : "firm";
  const lines = `<path d="${path(field, "actual")}" fill="none" stroke="#0a7aff" stroke-width="2.5"/><path d="${path(field, "projected")}" fill="none" stroke="#0a7aff" stroke-width="2.5" stroke-dasharray="6 5"/>${mode === "stock" ? `<path d="${path("conditional", "projected")}" fill="none" stroke="#d97706" stroke-width="2.5" stroke-dasharray="3 4"/>` : ""}`;
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (v) =>
        `<line x1="0" x2="600" y1="${y(v * max)}" y2="${y(v * max)}" stroke="#eeeeec"/>`,
    )
    .join("");
  return css(
    `position:absolute;left:0;width:100%;top:0;height:260px;background-size:100% 100%;background-repeat:no-repeat;background-image:url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 260" preserveAspectRatio="none">${grid}${lines}</svg>`)}")`,
  );
}
