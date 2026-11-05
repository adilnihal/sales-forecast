import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shop Ledger",
    short_name: "Shop Ledger",
    description: "Sales and purchase bills, stock, GST and forecast.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1324",
    theme_color: "#1e40af",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
