import type { Metadata, Viewport } from "next";
import "./fonts.css";
import AppEntry from "./components/AppEntry";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-matcha/theme.css";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./auth.css";
import "./companions.css";
import "./pet-home.css";
import "./support.css";
import "./garden-v2.css";

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content' };

export const metadata: Metadata = {
  title: "오늘의 정원",
  description: "나를 돌보는 작은 정원",
  appleWebApp: { capable: true, title: "오늘의 정원", statusBarStyle: "default" },
  icons: { apple: "/app-icon-192.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col" data-astryx-theme="matcha"><AppEntry>{children}</AppEntry></body>
    </html>
  );
}
