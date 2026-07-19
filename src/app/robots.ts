import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://insightaiforall.com";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/check", "/dashboard", "/history", "/results/"] },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}