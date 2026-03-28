import { sanitizeFilename } from "@/lib/platforms";

export interface YTFormat {
  itag: string;
  url: string;
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
  sourceClientName?: string;
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

interface RawThumbnail {
  url?: string;
  width?: number;
  height?: number;
}

interface RawFormat {
  itag: number | string;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  contentLength?: string;
  container?: string | null;
  hasAudio?: boolean;
  hasVideo?: boolean;
  sourceClientName?: string;
  quality?: {
    text?: string;
    label?: string;
  };
}

interface RawVideoInfo {
  videoDetails: {
    videoId: string;
    title?: string;
    description?: string | null;
    lengthSeconds?: number;
    viewCount?: number;
    author?: {
      name?: string;
      channelUrl?: string;
    } | null;
    thumbnails?: RawThumbnail[];
  };
  formats: RawFormat[];
}

interface YtdlCoreFormat {
  itag: number;
  url: string;
  mimeType?: string;
  bitrate?: number;
  qualityLabel?: string;
  quality?: string;
  width?: number;
  height?: number;
  fps?: number;
  contentLength?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  container: string;
  audioBitrate?: number;
}

interface YtdlCoreThumbnail {
  url: string;
  width: number;
  height: number;
}

interface YtdlCoreAuthor {
  id: string;
  name: string;
  channel_url: string;
}

export interface YtdlCoreVideoInfo {
  videoDetails: {
    videoId: string;
    title: string;
    description: string | null;
    lengthSeconds: string;
    viewCount: string;
    author: YtdlCoreAuthor;
    thumbnails: YtdlCoreThumbnail[];
  };
  formats: YtdlCoreFormat[];
}

const SOURCE_CLIENT_ORDER: Record<string, number> = {
  ios: 0,
  android: 1,
  mweb: 2,
  tv: 3,
  tvEmbedded: 4,
  web: 5,
  webCreator: 6,
  webEmbedded: 7,
  unknown: 8,
  "ytdl-core": 9,
};

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

function getContainer(rawFormat: RawFormat): string {
  if (rawFormat.container) return rawFormat.container;

  const mimeType = rawFormat.mimeType || "";
  const [mediaType] = mimeType.split(";");
  const container = mediaType?.split("/")[1];

  if (container) return container;
  if (mimeType.includes("webm")) return "webm";
  return "mp4";
}

function parseHeight(qualityLabel: string): number | undefined {
  const match = qualityLabel.match(/(\d+)p/i);
  return match ? Number(match[1]) : undefined;
}

function parseFps(qualityLabel: string): number | undefined {
  const match = qualityLabel.match(/p(\d+)$/i);
  return match ? Number(match[1]) : undefined;
}

function normalizeThumbnails(
  videoId: string,
  thumbnails?: Array<{ url?: string; width?: number; height?: number }>
): YTThumbnail[] {
  const fallback: YTThumbnail[] = [
    {
      quality: "Max Resolution",
      url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      width: 1920,
      height: 1080,
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
        index === 0 ? "Max Resolution" : index === 1 ? "High" : `Thumbnail ${index + 1}`,
      url: thumbnail.url || fallback[0].url,
      width: thumbnail.width || 0,
      height: thumbnail.height || 0,
    }));

  return unique.length > 0 ? unique : fallback;
}

function sortFormats(left: YTFormat, right: YTFormat) {
  const heightDelta = (right.height || 0) - (left.height || 0);
  if (heightDelta !== 0) return heightDelta;

  const fpsDelta = (right.fps || 0) - (left.fps || 0);
  if (fpsDelta !== 0) return fpsDelta;

  if (left.isMuxed !== right.isMuxed) {
    return left.isMuxed ? -1 : 1;
  }

  if (left.container !== right.container) {
    return left.container === "mp4" ? -1 : 1;
  }

  const sourceDelta =
    (SOURCE_CLIENT_ORDER[left.sourceClientName || "unknown"] ?? 99) -
    (SOURCE_CLIENT_ORDER[right.sourceClientName || "unknown"] ?? 99);
  if (sourceDelta !== 0) return sourceDelta;

  return right.bitrate - left.bitrate;
}

function dedupeFormats(formats: YTFormat[]) {
  return formats.filter((format, index, collection) => {
    const key = `${format.qualityLabel}:${format.container}:${format.isMuxed ? "muxed" : "video-only"}`;
    return (
      collection.findIndex(
        (candidate) =>
          `${candidate.qualityLabel}:${candidate.container}:${candidate.isMuxed ? "muxed" : "video-only"}` ===
          key
      ) === index
    );
  });
}

function normalizeFormats(rawFormats: RawFormat[]): YTFormat[] {
  return dedupeFormats(
    rawFormats
      .filter((format) => format.hasVideo && format.url)
      .map<YTFormat>((format) => {
        const qualityLabel =
          format.quality?.label || format.quality?.text || String(format.itag);
        const container = getContainer(format);

        return {
          itag: String(format.itag),
          url: format.url || "",
          quality: qualityLabel,
          qualityLabel,
          mimeType: format.mimeType || `video/${container}`,
          bitrate: format.bitrate || 0,
          width: undefined,
          height: parseHeight(qualityLabel),
          fps: parseFps(qualityLabel),
          hasAudio: Boolean(format.hasAudio),
          hasVideo: Boolean(format.hasVideo),
          contentLength: format.contentLength || "",
          container,
          isMuxed: Boolean(format.hasAudio && format.hasVideo),
          sourceClientName: format.sourceClientName || "unknown",
        };
      })
      .sort(sortFormats)
  );
}

function normalizeYtdlCoreFormats(rawFormats: YtdlCoreFormat[]): YTFormat[] {
  return dedupeFormats(
    rawFormats
      .filter(
        (format) =>
          format.hasVideo &&
          !!format.url &&
          !!format.height &&
          format.height > 0
      )
      .map<YTFormat>((format) => {
        const container = format.container || "mp4";
        const qualityLabel =
          format.qualityLabel ||
          (format.height ? `${format.height}p` : String(format.itag));

        return {
          itag: String(format.itag),
          url: format.url,
          quality: qualityLabel,
          qualityLabel,
          mimeType: format.mimeType || `video/${container}`,
          bitrate: format.bitrate || 0,
          width: format.width,
          height: format.height,
          fps: format.fps,
          hasAudio: format.hasAudio,
          hasVideo: format.hasVideo,
          contentLength: format.contentLength || "",
          container,
          isMuxed: format.hasAudio && format.hasVideo,
          sourceClientName: "ytdl-core",
        };
      })
      .sort(sortFormats)
  );
}

export function normalizeYouTubeInfo(
  info: RawVideoInfo | YtdlCoreVideoInfo
): YTVideoInfo {
  if ("videoDetails" in info) {
    const videoId = info.videoDetails.videoId;
    const thumbnails = normalizeThumbnails(videoId, info.videoDetails.thumbnails);

    const isYtdlCore = info.formats.length > 0 && "hasVideo" in info.formats[0];
    const formats = isYtdlCore
      ? normalizeYtdlCoreFormats(info.formats as unknown as YtdlCoreFormat[])
      : normalizeFormats(info.formats as unknown as RawFormat[]);

    if (formats.length === 0) {
      throw new Error("No playable YouTube formats were returned for this video");
    }

    const author =
      typeof info.videoDetails.author === "object" && info.videoDetails.author !== null
        ? (info.videoDetails.author as YtdlCoreAuthor).name ||
          (info.videoDetails.author as { name?: string }).name ||
          ""
        : String(info.videoDetails.author || "");

    const authorUrl =
      typeof info.videoDetails.author === "object" && info.videoDetails.author !== null
        ? (info.videoDetails.author as YtdlCoreAuthor).channel_url ||
          (info.videoDetails.author as { channelUrl?: string }).channelUrl ||
          ""
        : "";

    const lengthSeconds =
      typeof info.videoDetails.lengthSeconds === "string"
        ? Number(info.videoDetails.lengthSeconds)
        : (info.videoDetails.lengthSeconds as number);

    const viewCount =
      info.videoDetails.viewCount !== undefined &&
      info.videoDetails.viewCount !== null
        ? String(info.videoDetails.viewCount)
        : "";

    return {
      id: videoId,
      title: info.videoDetails.title || "YouTube video",
      author,
      authorUrl,
      thumbnail:
        thumbnails[0]?.url ||
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: formatDuration(lengthSeconds),
      viewCount,
      description:
        (info.videoDetails as { description?: string | null }).description || "",
      formats,
      thumbnails,
    };
  }

  throw new Error("Unsupported video info format");
}

export function buildYouTubeFilename(title: string, format: YTFormat): string {
  return sanitizeFilename(
    `${title}_${format.qualityLabel}.${format.container || "mp4"}`
  );
}
