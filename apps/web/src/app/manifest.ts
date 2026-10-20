import type { MetadataRoute } from "next";

/** Makes the app installable on Android ("Install app") — the Field role uses it as a PWA. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Civil Suits",
    short_name: "Civil Suits",
    description: "Bank-recovery suit automation — Promenix Softech",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#18181b",
    theme_color: "#18181b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
