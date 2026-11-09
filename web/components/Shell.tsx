"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./product/OriginalDemo.module.css";
import { ReleaseProvider, useRelease } from "./product/ReleaseProvider";

const pages = [
  { href: "/monday", label: "Monday" },
  { href: "/attention", label: "Attention" },
  { href: "/reports", label: "Reports" },
  { href: "/metrics", label: "Metrics" },
  { href: "/signal", label: "Connected demo" },
];

export default function Shell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  // The connected demo uses Metrics, never the separately published legacy queue.
  if (["/", "/signal", "/report", "/weekly", "/detail"].includes(pathname))
    return children;
  return (
    <ReleaseProvider>
      <ProductShell>{children}</ProductShell>
    </ReleaseProvider>
  );
}

function ProductShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const { queue } = useRelease();
  if (pathname === "/draft") return children;
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.crumb}>
          <span className={styles.crumbRoot}>
            Retailers<span className={styles.sep}>/</span>
          </span>
          Walmart<span className={styles.sep}>/</span>
        </span>
        <span className={styles.crumbCurrent}>
          {pages.find((page) => page.href === pathname)?.label ?? "Memento"}
        </span>
        <span className={styles.sample}>Synthetic demo</span>
      </header>
      <nav className={styles.sidebar} aria-label="Product navigation">
        {pages.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className={`${styles.item} ${pathname === page.href ? styles.active : ""}`}
            aria-current={pathname === page.href ? "page" : undefined}
          >
            <span>{page.label}</span>
            {page.href === "/attention" && queue && (
              <span className={styles.count} aria-hidden="true">
                {queue.signals.length}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <main
        className={`${styles.main} ${pathname === "/attention" ? "" : "report-scroll"}`}
      >
        {children}
      </main>
    </div>
  );
}
