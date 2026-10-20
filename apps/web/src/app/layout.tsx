import type { Metadata, Viewport } from "next";
import { Spotlight } from "@/components/spotlight";
import "./globals.css";

export const metadata: Metadata = {
  title: "Civil Suits — Promenix Softech",
  description: "Bank-recovery suit automation for Maharashtra advocate offices",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f8" },
    { media: "(prefers-color-scheme: dark)", color: "#07080d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div className="backdrop" aria-hidden>
          <div className="blob" />
          <div className="blob" />
          <div className="blob" />
        </div>
        <Spotlight />
        {children}
      </body>
    </html>
  );
}
