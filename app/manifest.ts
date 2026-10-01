import type { MetadataRoute } from "next";
import { BRAND } from "@/design/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: "A calm, private control centre for your projects",
    start_url: "/",
    display: "standalone",
    background_color: BRAND.background,
    theme_color: BRAND.theme,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
