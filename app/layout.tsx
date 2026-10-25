import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavigationProgress from "./components/NavigationProgress";
import NavbarWrapper from "./components/NavbarWrapper";
import SplashScreen from "./components/SplashScreen";
import BurstLayer from "./components/moments/Burst";
import EmailConfirmedModal from "./components/EmailConfirmedModal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://lineup-aesthetics.ca";
const SITE_DESCRIPTION =
  "Trusted on-demand beauty and personal services — post what you need, compare real offers from verified professionals, and book with confidence.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LineUp",
    template: "%s — LineUp",
  },
  description: SITE_DESCRIPTION,
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
  // og:image / twitter:image are generated automatically by
  // app/opengraph-image.tsx and app/twitter-image.tsx — Next wires those in
  // without needing an `images` entry here.
  openGraph: {
    title: "LineUp",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "LineUp",
    locale: "en_CA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LineUp",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Restore the last signed-in role's theme before first paint so the
            Pro/Customer accent never flashes in after load. The navbar keeps
            this in sync with the real profile. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var r=localStorage.getItem("lu-role");if(r==="pro"||r==="customer")document.documentElement.dataset.role=r}catch(e){}`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning={true}
        className={`${geistSans.variable} ${geistMono.variable} bg-white antialiased`}
      >
        <SplashScreen />
        <NavigationProgress />
        <NavbarWrapper />
        {children}
        <BurstLayer />
        <EmailConfirmedModal />
      </body>
    </html>
  );
}
