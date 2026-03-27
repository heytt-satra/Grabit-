export type Platform = "twitter" | "instagram" | "youtube" | "linkedin" | "universal";

export interface PlatformInfo {
  platform: Platform;
  label: string;
  color: string;
  icon: string;
}

const PLATFORM_MAP: Record<Platform, PlatformInfo> = {
  twitter: { platform: "twitter", label: "X / Twitter", color: "#1d9bf0", icon: "x" },
  instagram: { platform: "instagram", label: "Instagram", color: "#E1306C", icon: "instagram" },
  youtube: { platform: "youtube", label: "YouTube", color: "#FF0000", icon: "youtube" },
  linkedin: { platform: "linkedin", label: "LinkedIn", color: "#0A66C2", icon: "linkedin" },
  universal: { platform: "universal", label: "Screenshot", color: "#8b5cf6", icon: "globe" },
};

export function detectPlatform(url: string): Platform {
  const u = url.toLowerCase().trim();
  if (/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//.test(u)) return "twitter";
  if (/^https?:\/\/(www\.)?instagram\.com\//.test(u)) return "instagram";
  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(u)) return "youtube";
  if (/^https?:\/\/(www\.)?linkedin\.com\//.test(u)) return "linkedin";
  return "universal";
}

export function getPlatformInfo(platform: Platform): PlatformInfo {
  return PLATFORM_MAP[platform];
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

// --- Instagram URL parsing ---
export function extractInstagramShortcode(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed || !parsed.hostname.toLowerCase().includes("instagram.com")) return null;

  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  const mediaIndex = segments.findIndex((segment) =>
    ["p", "reel", "reels", "tv"].includes(segment)
  );

  if (mediaIndex === -1) return null;

  const originalSegments = parsed.pathname.split("/").filter(Boolean);
  return originalSegments[mediaIndex + 1] || null;
}

export function getInstagramType(url: string): "post" | "reel" | "story" | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;

  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  if (segments.includes("reel") || segments.includes("reels")) return "reel";
  if (segments.includes("stories")) return "story";
  if (segments.includes("p") || segments.includes("tv")) return "post";
  return null;
}

export function normalizeInstagramUrl(url: string): string | null {
  const parsed = parseUrl(url);
  const shortcode = extractInstagramShortcode(url);
  if (!parsed || !shortcode) return null;

  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  const normalizedType = segments.includes("tv")
    ? "tv"
    : segments.includes("reel") || segments.includes("reels")
      ? "reel"
      : "p";

  return `https://www.instagram.com/${normalizedType}/${shortcode}/`;
}

// --- YouTube URL parsing ---
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function isYouTubeShorts(url: string): boolean {
  return /youtube\.com\/shorts\//.test(url);
}

// --- LinkedIn URL parsing ---
export function extractLinkedInActivityId(url: string): string | null {
  const m = url.match(/(?:activity|share)[:-](\d+)/i) || url.match(/activity-(\d+)/i);
  return m ? m[1] : null;
}

export function normalizeLinkedInUrl(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed || !parsed.hostname.toLowerCase().includes("linkedin.com")) return null;

  const activityId = extractLinkedInActivityId(url);
  const cleanedPath = parsed.pathname.replace(/\/+$/, "");

  if (/\/feed\/update\/urn:li:share:/i.test(cleanedPath) && activityId) {
    return `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
  }

  if (/\/feed\/update\/urn:li:activity:/i.test(cleanedPath) && activityId) {
    return `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
  }

  return `https://www.linkedin.com${cleanedPath || "/"}`;
}

// --- General ---
export function isValidUrl(url: string): boolean {
  return parseUrl(url) !== null;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 200);
}
