import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Apple devices render San Francisco via the system font stack in globals.css;
// Inter is the closest freely licensed fallback for everyone else.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Billjot India",
  description: "POS, kiosk and online ordering for Indian F&B",
};

export const viewport: Viewport = {
  themeColor: "#f5f5f7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background text-foreground">{children}</body>
    </html>
  );
}
