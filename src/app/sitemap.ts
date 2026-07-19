import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://insightaiforall.com";
  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/terms`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
}