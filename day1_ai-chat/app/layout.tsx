import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Force all pages to be dynamically rendered (no static prerendering)
// This avoids useContext errors during build when prerendering client components
export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Chat MAX",
  description: "Chat with AI powered by DeepSeek",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
