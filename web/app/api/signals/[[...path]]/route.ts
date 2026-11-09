import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { demoBundleSchema, demoResponse } from "@/lib/signal/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store" };
  if (process.env.MEMENTO_SERVING_MODE === "cloudflare" || process.env.MEMENTO_DEMO_BUNDLE !== "1") return Response.json({ message: "Hosted demo mode is disabled." }, { status: 404, headers });
  try {
    const fixture = process.env.NODE_ENV === "development" && process.env.MEMENTO_SECURITY_VERIFY === "1" ? process.env.MEMENTO_SYNTHETIC_TEST_BUNDLE : undefined;
    const bundle = demoBundleSchema.parse(JSON.parse(await readFile(fixture ?? join(process.cwd(), ".demo", "demo-1.json"), "utf8")));
    const { path = [] } = await context.params;
    const result = demoResponse(bundle, path, new URL(request.url).searchParams);
    return Response.json(result.body, { status: result.status, headers });
  } catch {
    return Response.json({ api_contract_version: "memento-signal-api-v1", code: "release_integrity_error", message: "The frozen synthetic demo failed validation." }, { status: 503, headers });
  }
}
