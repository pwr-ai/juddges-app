import type { MetadataRoute } from "next";
import { getBrandConfig } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  const brand = getBrandConfig();

  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a1a2e",
    orientation: "portrait-primary",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: brand.logo,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: brand.logo,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
