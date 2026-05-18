import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/lineup-apple-touch-icon.png",
    other: [
      {
        rel: "apple-touch-icon",
        url: "/lineup-apple-touch-icon.png",
      },
    ],
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
        {children}
      </body>
    </html>
  );
}