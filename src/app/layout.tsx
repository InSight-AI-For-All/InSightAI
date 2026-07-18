import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "InSight AI | Know before you share", template: "%s | InSight AI" },
  description:
    "Evidence-assisted truth checks for links, screenshots, and claims at the speed of social media.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    title: "InSight AI",
    description: "Drop a post. Get an evidence-assisted truth score.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}