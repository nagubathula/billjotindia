import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Geist isn't exposed via next/font/google (shadcn's init template assumed it);
// Inter is the sensible default and matches the shadcn neutral aesthetic.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Billjot India",
  description: "POS, kiosk and online ordering for Indian F&B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background text-foreground">{children}</body>
    </html>
  );
}
