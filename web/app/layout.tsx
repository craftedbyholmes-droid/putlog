import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Putlog", description: "Scaffolding jobs, quotes and compliance in one place" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#1f3a5f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-GB"><body className="font-sans antialiased">{children}</body></html>;
}
