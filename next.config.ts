import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["youtube-dl-exec", "ffmpeg-static"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
      { protocol: "https", hostname: "video.twimg.com" },
    ],
  },
};

export default nextConfig;
