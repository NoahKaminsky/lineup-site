import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
