import { z } from "zod";
import { productSchema, summarySchema, storePageSchema } from "./schema";

async function read<T>(
  kind: string,
  query: URLSearchParams,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/metrics/${kind}?${query}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "This product or scope is unavailable in the selected publication."
        : "The selected publication is unavailable or failed validation.",
    );
  return schema.parse(await response.json());
}
export async function loadSummary(
  release: string | null,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  if (release) query.set("release_id", release);
  const value = await read("workspace-summary", query, summarySchema, signal);
  if (release && value.metric_release_id !== release)
    throw new Error("Publication identity mismatch.");
  return value;
}
export async function loadProduct(
  release: string,
  product: string,
  region: string | null,
  finding: string | null,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    release_id: release,
    product_id: product,
  });
  if (region) query.set("region", region);
  if (finding) query.set("finding_id", finding);
  const value = await read("product-view", query, productSchema, signal);
  if (
    value.metric_release_id !== release ||
    value.product_id !== product ||
    value.region !== region ||
    value.finding_id !== finding
  )
    throw new Error("Product publication or scope mismatch.");
  return value;
}

export async function loadStores(
  release: string,
  product: string,
  region: string | null,
  search: string,
  offset: number,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    release_id: release,
    product_id: product,
    search,
    offset: String(offset),
    limit: "25",
  });
  if (region) query.set("region", region);
  const value = await read("workspace-stores", query, storePageSchema, signal);
  if (
    value.metric_release_id !== release ||
    value.product_id !== product ||
    value.region !== region ||
    value.search !== search ||
    value.offset !== offset
  )
    throw new Error("Store page identity mismatch.");
  return value;
}
