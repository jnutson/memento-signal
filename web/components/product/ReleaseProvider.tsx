"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchSignalQueue } from "@/lib/signal/client";
import type { SignalQueue } from "@/lib/signal/schema";

type ReleaseState = {
  queue: SignalQueue | null;
  error: boolean;
  retry: () => void;
};
const ReleaseContext = createContext<ReleaseState | null>(null);

export function ReleaseProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<SignalQueue | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchSignalQueue(undefined, controller.signal)
      .then((release) => {
        if (!controller.signal.aborted) setQueue(release);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  const retry = () => {
    setError(false);
    setQueue(null);
    setAttempt((value) => value + 1);
  };
  return (
    <ReleaseContext.Provider value={{ queue, error, retry }}>
      {children}
    </ReleaseContext.Provider>
  );
}

export function useRelease() {
  const state = useContext(ReleaseContext);
  if (!state) throw new Error("Release provider is required.");
  return state;
}

export function ReleaseGate({
  children,
}: {
  children: (queue: SignalQueue) => ReactNode;
}) {
  const { queue, error, retry } = useRelease();
  if (error)
    return (
      <section className="route-state" role="alert">
        <p className="eyebrow">Published release</p>
        <h1>Release unavailable</h1>
        <p>
          The current signal release could not be loaded or validated. No sample
          numbers have been substituted.
        </p>
        <button className="button" onClick={retry}>
          Retry
        </button>
      </section>
    );
  if (!queue)
    return (
      <section className="route-state" role="status">
        <p className="eyebrow">Published release</p>
        <h1>Loading your briefing</h1>
        <p>Validating the current immutable signal release…</p>
      </section>
    );
  return children(queue);
}
