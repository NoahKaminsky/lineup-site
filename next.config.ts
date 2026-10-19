import type { NextConfig } from "next";

// Security headers on every page and API response.
const securityHeaders = [
  // Always use HTTPS (2 years), including subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Nobody can load LineUp inside a frame on their site (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  // Browsers must trust our declared file types (stops uploaded files being
  // run as scripts).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs (which contain booking/request ids) to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Only location is used (Browse "near me"); everything else is off.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    viewTransition: true,
  },
  images: {
    // Lets next/image optimize user-uploaded photos (avatars, service photos,
    // reference images) that live in Supabase Storage, not just /public.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "rbsgsymjmptwczecgohb.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
