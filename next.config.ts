import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
      { protocol: "https", hostname: "video.twimg.com" },
    ],
  },
  outputFileTracingIncludes: {
    "/api/youtube/download": [
      "./node_modules/ffmpeg-static/ffmpeg*",
    ],
  },
};

export default nextConfig;
