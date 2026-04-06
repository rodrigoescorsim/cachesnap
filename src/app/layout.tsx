import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HopLens — Edge Performance Monitoring",
  description: "Monitor latency from 5 global regions. Detect cache misses, edge vs. origin issues, and get plain-English diagnoses — no SDK required.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
