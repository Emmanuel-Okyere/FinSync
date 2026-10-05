import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FinSync",
    short_name: "FinSync",
    description: "Split your pay, tick off bills, and see what's safe to spend today.",
    start_url: "/home",
    display: "standalone",
    background_color: "#0f5d4a",
    theme_color: "#0f5d4a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
