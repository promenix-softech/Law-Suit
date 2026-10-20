import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Civil Suits — Promenix Softech",
  description: "Bank-recovery suit automation for Maharashtra advocate offices",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
