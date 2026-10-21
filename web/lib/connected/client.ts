import { z } from "zod";
import {
  findingSchema,
  metadataSchema,
  releaseId,
  reviewSchema,
  type Metadata,
} from "./schema";

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/metrics/${path}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      `Evidence service unavailable (${response.status}). No preview data has been substituted.`,
    );
  return response.json();
}

export async function loadMetadata(
  release: string | null,
  signal?: AbortSignal,
) {
  const query = release
    ? `?release_id=${encodeURIComponent(releaseId.parse(release))}`
    : "";
  const metadata = metadataSchema.parse(
    await request(`metadata${query}`, signal),
  );
  if (release && metadata.metric_release_id !== release)
    throw new Error("Evidence release mismatch.");
  return metadata;
}

export function supportsFindings(metadata: Metadata) {
  return (
    metadata.files.some((file) => file.path === "finding.parquet") &&
    metadata.files.some((file) => file.path === "finding_evidence.parquet")
  );
}

export async function allRows<S extends z.ZodType>(
  kind: string,
  schema: S,
  release: string,
  filters: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<z.output<S>[]> {
  releaseId.parse(release);
  const envelope = z.object({
    metric_release_id: releaseId,
    kind: z.string(),
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(200),
    rows: z.array(schema),
  });
  const result: z.output<S>[] = [];
  let total: number | undefined;
  for (let offset = 0; offset <= 1_000_000; ) {
    const query = new URLSearchParams({
      ...filters,
      release_id: release,
      offset: String(offset),
      limit: "200",
    });
    const page = envelope.parse(await request(`${kind}?${query}`, signal));
    if (
      page.metric_release_id !== release ||
      page.kind !== kind ||
      page.offset !== offset ||
      (total !== undefined && page.total !== total) ||
      page.rows.length > page.limit ||
      offset + page.rows.length > page.total
    )
      throw new Error(
        "Evidence page identity or population changed. Nothing was exported.",
      );
    total = page.total;
    result.push(...page.rows);
    if (result.length === total) return result;
    if (!page.rows.length || page.rows.length !== page.limit)
      throw new Error("Incomplete evidence page. Nothing was exported.");
    offset += page.rows.length;
  }
  throw new Error("Evidence exceeds the supported export size.");
}

export const loadFindings = (release: string, signal?: AbortSignal) =>
  allRows("findings", findingSchema, release, {}, signal);
export async function loadReview(
  release: string,
  finding: string,
  signal?: AbortSignal,
) {
  const value = reviewSchema.parse(
    await request(
      `review-context?${new URLSearchParams({ release_id: release, finding_id: finding })}`,
      signal,
    ),
  );
  if (value.metric_release_id !== release || value.finding_id !== finding)
    throw new Error("Review identity mismatch.");
  return value;
}
