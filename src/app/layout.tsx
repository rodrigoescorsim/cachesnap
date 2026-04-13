import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CacheSnap — Edge Performance Monitoring",
  description: "Monitor latency from 5 global regions. Detect cache misses, edge vs. origin issues, and get plain-English diagnoses — no SDK required.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased bg-zinc-900 text-zinc-100">
      <body className="min-h-full flex flex-col selection:bg-cyan-500/30">{children}</body>
    </html>
  );
}
