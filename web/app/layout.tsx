import type { Metadata } from "next";
import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Memento Loop · Retail analytics",
  description: "Interactive Attention exploration and evidence-backed retail signals",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
