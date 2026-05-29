import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://cachesnap.com"),
  title: {
    default: "CacheSnap — Edge Performance Monitoring",
    template: "%s | CacheSnap",
  },
  description: "Deep visibility into your edge stack — cache hit rates, CDN performance, and regional latency across global regions. Zero code, zero configuration.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "CacheSnap",
    title: "CacheSnap — Edge Performance Monitoring",
    description: "Deep visibility into your edge stack — cache hit rates, CDN performance, and regional latency across global regions. Zero code, zero configuration.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "CacheSnap — Edge Performance Monitoring",
    description: "Deep visibility into your edge stack — cache hit rates, CDN performance, and regional latency across global regions. Zero code, zero configuration.",
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '512x512', type: 'image/png' },
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: "lISHRsfX7WTk4lGcR692TA4LHZL8Gc6Il-F16oBOHkI",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} dark h-full scroll-auto md:scroll-smooth antialiased bg-background text-foreground`}
    >
      <body className="min-h-full flex flex-col selection:bg-cyan-500/30">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-bold focus:text-black"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Skip to content
        </a>
        <QueryProvider>{children}</QueryProvider>
        <Script
          defer
          data-url="https://devhunt.org/tool/cachesnap"
          src="https://cdn.jsdelivr.net/gh/sidiDev/devhunt-banner/indexV0.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
