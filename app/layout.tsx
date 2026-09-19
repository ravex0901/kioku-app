import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Shippori_Mincho } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const shipporiMincho = Shippori_Mincho({
  variable: "--font-shippori-mincho",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "きおく | 生前整理AI",
  description: "ものの記録と片付けの進捗をやさしく整理するアプリ「きおく」",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "きおく",
  },
};

// スマホでホーム画面に追加して「アプリ」として使えるように、
// ノッチ・セーフエリアに対応し、拡大縮小によるレイアウト崩れを防ぐ。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f6efe0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${shipporiMincho.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
