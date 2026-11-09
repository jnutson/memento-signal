export const lenses = {
  availability: "Never miss a reorder window",
  excess: "Avoid the markdown",
  expansion: "Get more doors, with proof",
};
export const number = (value: number | null | undefined) =>
  value == null
    ? "Unavailable"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
export const money = (value: number | null) =>
  value == null
    ? "Unavailable"
    : value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      });
export const words = (value: string) => value.replaceAll("_", " ");
export const dateLabel = (value: string | null) =>
  value ? value.slice(0, 10) : "Unavailable";
