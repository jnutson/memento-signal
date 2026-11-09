import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  metadataSchema,
  findingSchema,
  evidenceSchema,
} from "@/lib/connected/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const row = z.record(z.string(), z.unknown());
const bundleSchema = z.object({
  demo_id: z.literal("demo-1"),
  classification: z.literal("synthetic"),
  metadata: metadataSchema,
  tables: z.record(z.string(), z.array(row)),
  special: z.record(z.string(), row),
});
const querySchema = z
  .object({
    release_id: z
      .string()
      .regex(/^met_[a-f0-9]{64}$/)
      .optional(),
    product_id: z.string().max(100).optional(),
    finding_id: z
      .string()
      .regex(/^find_[a-f0-9]{64}$/)
      .optional(),
    grain: z.enum(["item", "store", "region", "tier"]).default("item"),
    period_kind: z.enum(["week", "month"]).default("week"),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
    scope_id: z.string().max(200).optional(),
    period_start: z.iso.date().optional(),
  })
  .strict();
export async function GET(
  request: Request,
  ctx: { params: Promise<{ kind: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "CDN-Cache-Control": "no-store",
  };
  const fail = (status: number, detail: string) =>
    Response.json({ detail }, { status, headers });
  if (
    process.env.MEMENTO_SERVING_MODE === "cloudflare" ||
    process.env.MEMENTO_DEMO_BUNDLE !== "1"
  )
    return fail(404, "Hosted demo disabled");
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return fail(422, "Invalid frozen demo query");
  try {
    const bundle = bundleSchema.parse(
      JSON.parse(
        await readFile(join(process.cwd(), ".demo", "original.json"), "utf8"),
      ),
    );
    const q = parsed.data;
    const { kind } = await ctx.params;
    const release = bundle.metadata.metric_release_id;
    if (q.release_id && q.release_id !== release)
      return fail(503, "Pinned release unavailable");
    if (kind === "metadata") return Response.json(bundle.metadata, { headers });
    if (kind === "attention-values") {
      const value =
        bundle.special[q.finding_id ? `${kind}:${q.finding_id}` : kind];
      return value
        ? Response.json(value, { headers })
        : fail(404, "No matching financial estimate");
    }
    const specialKey =
      kind === "display-series"
        ? `${kind}:${q.product_id}${q.finding_id ? ":" + q.finding_id : ""}`
        : kind === "review-context"
          ? `${kind}:${q.finding_id}`
          : kind;
    if (bundle.special[specialKey])
      return Response.json(bundle.special[specialKey], { headers });
    const key =
      kind === "periods"
        ? `${kind}:${q.grain}:${q.period_kind}`
        : kind === "distribution"
          ? `${kind}:${q.grain}`
          : kind;
    const source = bundle.tables[key];
    if (!source) return fail(404, "Endpoint is not part of this frozen demo");
    if (kind === "findings") z.array(findingSchema).parse(source);
    if (kind === "finding-evidence") z.array(evidenceSchema).parse(source);
    const rows = source.filter(
      (r) =>
        (!q.product_id || r.product_id === q.product_id) &&
        (!q.finding_id || r.finding_id === q.finding_id) &&
        (!q.scope_id || r.scope_id === q.scope_id) &&
        (!q.period_start || r.period_start === q.period_start),
    );
    return Response.json(
      {
        metric_release_id: release,
        kind,
        total: rows.length,
        offset: q.offset,
        limit: q.limit,
        rows: rows.slice(q.offset, q.offset + q.limit),
      },
      { headers },
    );
  } catch {
    return fail(503, "Frozen synthetic release failed validation");
  }
}
