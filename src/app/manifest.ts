import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InSight AI — Truth Checks for the Speed of Social Media",
    short_name: "InSight AI",
    description: "Evidence-assisted truth checks for links, screenshots, and claims.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#010A24",
    theme_color: "#03153C",
    orientation: "portrait-primary",
    categories: ["education", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New fact check", short_name: "New check", url: "/check", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Check history", short_name: "History", url: "/history", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}