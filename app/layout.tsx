import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/app/components/AppNavbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LineUp",
  description: "Beauty marketplace for trusted on-demand services.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png?v=2",
    shortcut: "/favicon.png?v=2",
    apple: "/apple-touch-icon.png?v=2",
  },
  appleWebApp: {
    capable: true,
    title: "LineUp",
    statusBarStyle: "default",
  },
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning={true}
        className={`${geistSans.variable} ${geistMono.variable} bg-white antialiased`}
      >
        <Navbar />
        {children}
      </body>
    </html>
  );
}