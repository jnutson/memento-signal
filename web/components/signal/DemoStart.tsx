"use client";

import styles from "./Signal.module.css";
import { publicationStorageKey, workspacePath } from "@/lib/workspace-path";

export default function DemoStart() {
  return <section className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Memento Loop · Demo 1</p><h1>Monday inventory review</h1><p>See what needs attention, then follow the evidence.</p></div><span className={styles.badge}>Synthetic demo · read only</span></header>
    <section className={styles.summary} style={{ maxWidth: 680 }}>
      <h2 style={{ fontSize: 25 }}>Your Monday report, ready to explore</h2>
      <p className={styles.notice}>Open the report, review the ranked attention queue, and inspect stockout risk, excess inventory, and demand overperformance using the existing reporting workspace.</p>
      <p className={styles.notice}>Each walkthrough starts with the same frozen synthetic data. You can explore freely and restart at any time.</p>
      <form action={workspacePath("/report")} method="get" onSubmit={() => sessionStorage.removeItem(publicationStorageKey())}><button type="submit">Start demo →</button></form>
    </section>
  </section>;
}
