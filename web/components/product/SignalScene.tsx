"use client";

import { useEffect, useRef, useState } from "react";
import type { AttentionScene } from "@/lib/attention/original-scene";
import type { SignalRow } from "@/lib/signal/schema";
import { signalWorld } from "@/lib/signal/presentation";
import styles from "./OriginalAttention.module.css";
import adaptation from "./Adaptation.module.css";

type Props = { signals: SignalRow[]; selectedId: string | null; hoveredId?: string | null; onSelect: (id: string | null) => void; onHover?: (id: string | null) => void };
export default function SignalScene({ signals, selectedId, hoveredId = null, onSelect, onHover }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<AttentionScene | null>(null);
  const latest = useRef({ signals, selectedId, onSelect, onHover });
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    latest.current = { signals, selectedId, onSelect, onHover };
  }, [signals, selectedId, onSelect, onHover]);
  useEffect(() => {
    scene.current?.setItems(signals.map((row) => ({ id: row.signal_id, title: `${row.identity.item_name} · ${row.identity.store_name}`, w: signalWorld(row) })));
  }, [signals]);
  useEffect(() => {
    scene.current?.focus(selectedId);
  }, [selectedId]);
  useEffect(() => { scene.current?.setHover(hoveredId); }, [hoveredId]);
  useEffect(() => {
    let active = true;
    let instance: AttentionScene | null = null;
    void import("@/lib/attention/original-scene").then(({ createScene }) => {
      if (!active || !host.current) return;
      instance = createScene(host.current, { onSelect: (id) => latest.current.onSelect(id), onHover: (id) => latest.current.onHover?.(id), thirdAxisLabel: latest.current.signals.every((row) => row.urgency_score != null) ? "Urgency" : "Baseline actionability" });
      instance.setItems(latest.current.signals.map((row) => ({ id: row.signal_id, title: `${row.identity.item_name} · ${row.identity.store_name}`, w: signalWorld(row) })));
      instance.focus(latest.current.selectedId);
      scene.current = instance;
    }).catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; instance?.dispose(); scene.current = null; };
  }, []);
  return <section className={`${styles.stage} ${adaptation.stage}`} aria-label="Interactive Impact, Urgency, and Confidence score scene">
    <div className={styles.host} ref={host} data-testid="attention-scene" />
    {unavailable ? <p className={styles.noGl} role="status">3D is unavailable in this browser. All signals remain accessible in the ranked list.</p> : <div className={styles.stageBottom}><button className={styles.pill} onClick={() => { scene.current?.reset(); onSelect(null); }}>Reset view</button></div>}
  </section>;
}
