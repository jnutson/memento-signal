"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Shell.module.css";

export default function Shell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span>Memento Loop</span>
        <span className={styles.divider}>/</span>
        <span className={styles.context}>Walmart · Miro Spark</span>
      </header>
      <nav className={styles.sidebar} aria-label="Product navigation">
        <Link href="/attention" className={`${styles.item} ${pathname === "/attention" ? styles.active : ""}`} aria-current={pathname === "/attention" ? "page" : undefined}>Attention</Link>
        <Link href="/signal" className={`${styles.item} ${pathname === "/signal" ? styles.active : ""}`} aria-current={pathname === "/signal" ? "page" : undefined}>Memento Signal</Link>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
