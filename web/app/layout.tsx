import type { Metadata } from "next";
import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Memento Loop · Retail analytics",
  description:
    "Monday briefings, ranked Attention, and reproducible retail reports",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
