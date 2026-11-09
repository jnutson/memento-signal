import { useMemo, useSyncExternalStore } from "react";
import { z } from "zod";

const KEY = "memento-focus-draft-plans-v1";
const EVENT = "memento-focus-draft-plan-change";
const schema = z
  .array(
    z.object({
      signalId: z.string().regex(/^sig_[0-9a-f]{64}$/),
      releaseId: z.string(),
      item: z.string(),
      location: z.string(),
      action: z.string(),
      watch: z.string(),
      note: z.string().max(500),
      recordedOn: z.iso.date(),
      reviewOn: z.iso.date(),
    }),
  )
  .max(100);
export type DraftPlan = z.infer<typeof schema>[number];

function read() {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(EVENT, listener);
  };
}

export function useDraftPlans() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return useMemo(() => {
    try {
      return schema.parse(JSON.parse(raw ?? "[]"));
    } catch {
      return [];
    }
  }, [raw]);
}

export function saveDraftPlan(plan: DraftPlan) {
  try {
    const existing = schema.parse(JSON.parse(read() ?? "[]"));
    const plans = existing.filter(
      (p) => !(p.signalId === plan.signalId && p.releaseId === plan.releaseId),
    );
    window.localStorage.setItem(
      KEY,
      JSON.stringify(schema.parse([...plans, plan])),
    );
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}
