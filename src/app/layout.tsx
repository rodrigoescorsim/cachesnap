import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700", "800", "900"],
});

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
    <html
      lang="en"
      className={`${inter.variable} dark h-full antialiased bg-background text-foreground`}
    >
      <body className="min-h-full flex flex-col selection:bg-cyan-500/30">{children}</body>
    </html>
  );
}
