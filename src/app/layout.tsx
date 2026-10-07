import type { Metadata } from "next";
import { Geist, Geist_Mono, Do_Hyeon, Gowun_Dodum } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const doHyeon = Do_Hyeon({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

const gowunDodum = Gowun_Dodum({
  variable: "--font-body",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "오늘의 정원",
  description: "나를 돌보는 작은 정원",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${doHyeon.variable} ${gowunDodum.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
