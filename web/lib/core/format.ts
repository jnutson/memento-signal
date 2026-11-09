export const number = (v: number | null | undefined, digits = 0) =>
  v == null
    ? "Unavailable"
    : v.toLocaleString("en-US", { maximumFractionDigits: digits });
export const money = (v: number | null | undefined) =>
  v == null
    ? "Unavailable"
    : v.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
export const percent = (v: number | null | undefined) =>
  v == null ? "Unavailable" : `${v > 0 ? "+" : ""}${number(v, 1)}%`;
export const day = (value: string) =>
  new Date(value + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export function detailUrl(
  release: string,
  product: string,
  tab: string = "Sales",
  region?: string | null,
  basis = "firm",
  finding?: string | null,
) {
  const params = new URLSearchParams({ release, product, tab, basis });
  if (region) params.set("region", region);
  if (finding) params.set("finding", finding);
  return `/detail?${params}`;
}
