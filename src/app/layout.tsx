import type { Metadata, Viewport } from "next";
import "./fonts.css";
import AppSessionBoundary from "./components/AppSessionBoundary";
import "./globals.css";
import "./auth.css";

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content' };

export const metadata: Metadata = {
  title: "오늘의 정원",
  description: "나를 돌보는 작은 정원",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col"><AppSessionBoundary>{children}</AppSessionBoundary></body>
    </html>
  );
}
