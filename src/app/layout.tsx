import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { TelemetryProvider } from "@/components/telemetry-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "InSight AI — Truth Checks for the Speed of Social Media", template: "%s | InSight AI" },
  description:
    "Evidence-assisted truth checks for links, screenshots, and claims at the speed of social media.",
  applicationName: "InSight AI",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://insightaiforall.com"),
  category: "technology",
  creator: "InSight AI",
  publisher: "InSight AI",
  keywords: ["fact checking", "media literacy", "source verification", "AI analysis", "truth score"],
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "InSight AI" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "InSight AI — Truth Checks for the Speed of Social Media",
    description: "Drop a post, screenshot, link, or claim. Get an evidence-assisted truth score with sources and uncertainty.",
    type: "website",
    siteName: "InSight AI",
    locale: "en_US",
    url: "/",
    images: [{ url: "/brand/social/og-default.png", width: 1200, height: 630, alt: "InSight AI — Truth checks for the speed of social media" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "InSight AI — Truth Checks for the Speed of Social Media",
    description: "Evidence-assisted truth checks for links, screenshots, and claims.",
    images: ["/brand/social/twitter-default.png"],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#03153C",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link rel="apple-touch-startup-image" href="/brand/marketing/apple-splash-1290x2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" />
      </head>
      <body><AuthProvider><TelemetryProvider />{children}</AuthProvider></body>
    </html>
  );
}