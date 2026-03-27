import ytdl from "@distube/ytdl-core";
import { extractYouTubeId, sanitizeFilename } from "@/lib/platforms";

export interface YTFormat {
  itag: string;
  quality: string;
  qualityLabel: string;
  mimeType: string;
  bitrate: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  hasVideo: boolean;
  contentLength?: string;
  container: string;
  isMuxed: boolean;
}

export interface YTThumbnail {
  quality: string;
  url: string;
  width: number;
  height: number;
}

export interface YTVideoInfo {
  id: string;
  title: string;
  author: string;
  authorUrl: string;
  thumbnail: string;
  duration: string;
  viewCount: string;
  description: string;
  formats: YTFormat[];
  thumbnails: YTThumbnail[];
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";

  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function buildQualityLabel(format: ytdl.videoFormat): string {
  if (format.qualityLabel) return format.qualityLabel;

  if (format.height) {
    const fpsSuffix = format.fps && format.fps > 30 ? `${format.fps}` : "";
    return `${format.height}p${fpsSuffix}`;
  }

  return format.quality || String(format.itag);
}

function normalizeThumbnails(
  videoId: string,
  thumbnails: ytdl.thumbnail[] | undefined
): YTThumbnail[] {
  const fallback: YTThumbnail[] = [
    {
      quality: "Max Resolution",
      url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      width: 1920,
      height: 1080,
    },
    {
      quality: "Standard",
      url: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
      width: 640,
      height: 480,
    },
    {
      quality: "High",
      url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      width: 480,
      height: 360,
    },
  ];

  if (!thumbnails?.length) return fallback;

  const unique = thumbnails
    .filter((thumbnail) => !!thumbnail.url)
    .sort(
      (left, right) =>
        (right.width || 0) * (right.height || 0) -
        (left.width || 0) * (left.height || 0)
    )
    .filter(
      (thumbnail, index, collection) =>
        collection.findIndex((candidate) => candidate.url === thumbnail.url) ===
        index
    )
    .map((thumbnail, index) => ({
      quality:
        index === 0
          ? "Max Resolution"
          : index === 1
            ? "High"
            : `Thumbnail ${index + 1}`,
      url: thumbnail.url,
      width: thumbnail.width || 0,
      height: thumbnail.height || 0,
    }));

  return unique.length > 0 ? unique : fallback;
}

function selectFormats(formats: ytdl.videoFormat[]): YTFormat[] {
  // Filter to video-containing formats
  const videoFormats = formats.filter(
    (format) =>
      format.hasVideo &&
      format.container === "mp4"
  );

  const candidateFormats =
    videoFormats.length > 0
      ? videoFormats
      : formats.filter((format) => format.hasVideo);

  const mapped = candidateFormats.map<YTFormat>((format) => ({
    itag: String(format.itag),
    quality: buildQualityLabel(format),
    qualityLabel: buildQualityLabel(format),
    mimeType: format.mimeType || `video/${format.container || "mp4"}`,
    bitrate: format.bitrate || 0,
    width: format.width,
    height: format.height,
    fps: format.fps,
    hasAudio: format.hasAudio,
    hasVideo: format.hasVideo,
    contentLength: format.contentLength || "",
    container: format.container || "mp4",
    isMuxed: format.hasAudio && format.hasVideo,
  }));

  const deduped = mapped
    .sort((left, right) => {
      const heightDelta = (right.height || 0) - (left.height || 0);
      if (heightDelta !== 0) return heightDelta;

      const fpsDelta = (right.fps || 0) - (left.fps || 0);
      if (fpsDelta !== 0) return fpsDelta;

      if (left.isMuxed !== right.isMuxed) {
        return left.isMuxed ? -1 : 1;
      }

      return right.bitrate - left.bitrate;
    })
    .filter((format, index, collection) => {
      const key = `${format.qualityLabel}:${format.isMuxed ? "muxed" : "video"}`;
      return (
        collection.findIndex(
          (candidate) =>
            `${candidate.qualityLabel}:${candidate.isMuxed ? "muxed" : "video"}` ===
            key
        ) === index
      );
    });

  return deduped;
}

export async function fetchYouTubeInfo(url: string): Promise<YTVideoInfo> {
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  let info: ytdl.videoInfo;

  try {
    info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.trim()
        : typeof error === "string"
          ? error.trim()
          : "";

    throw new Error(message || "Failed to extract YouTube formats");
  }

  const details = info.videoDetails;
  const thumbnails = normalizeThumbnails(videoId, details.thumbnails);
  const formats = selectFormats(info.formats);

  return {
    id: details.videoId || videoId,
    title: details.title,
    author: details.author?.name || "",
    authorUrl: details.author?.channel_url || "",
    thumbnail:
      thumbnails[0]?.url ||
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    duration: formatDuration(Number(details.lengthSeconds) || 0),
    viewCount: details.viewCount || "",
    description: details.description || "",
    formats,
    thumbnails,
  };
}

/**
 * Get a readable download stream for a YouTube video.
 * Uses @distube/ytdl-core — pure Node.js, no Python required.
 */
export function getYouTubeDownloadStream(
  url: string,
  itag: number
): NodeJS.ReadableStream {
  return ytdl(url, {
    quality: itag,
    highWaterMark: 1 << 25, // 32MB buffer for smoother streaming
  });
}

export function buildYouTubeFilename(title: string, format: YTFormat): string {
  return sanitizeFilename(
    `${title}_${format.qualityLabel}${format.isMuxed ? "" : "_max"}.${format.container || "mp4"}`
  );
}
