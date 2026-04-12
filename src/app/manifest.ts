import type { MetadataRoute } from "next";

const THEME = "#0f1e3d";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ketolog",
    short_name: "Ketolog",
    description: "ケトジェニック食事管理アプリ",
    lang: "ja",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME,
    theme_color: THEME,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
