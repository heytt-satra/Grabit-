import youtubedl from "youtube-dl-exec";
import { extractYouTubeId, sanitizeFilename } from "@/lib/platforms";

interface YTDlpThumbnail {
  url: string;
  width?: number;
  height?: number;
}

interface YTDlpFormat {
  format_id: string;
  format_note?: string;
  format?: string;
  ext?: string;
  container?: string;
  filesize?: number;
  filesize_approx?: number;
  width?: number;
  height?: number;
  fps?: number;
  tbr?: number;
  acodec?: string;
  vcodec?: string;
}

interface YTDlpInfo {
  id: string;
  title: string;
  uploader?: string;
  uploader_url?: string;
  description?: string;
  duration?: number;
  view_count?: number;
  thumbnails?: YTDlpThumbnail[];
  formats: YTDlpFormat[];
}

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

function buildQualityLabel(format: YTDlpFormat): string {
  if (format.format_note) return format.format_note;

  if (format.height) {
    const fpsSuffix = format.fps && format.fps > 30 ? `${format.fps}` : "";
    return `${format.height}p${fpsSuffix}`;
  }

  return format.format || format.format_id;
}

function buildMimeType(format: YTDlpFormat): string {
  const mediaKind =
    format.vcodec && format.vcodec !== "none" ? "video" : "audio";
  const codecs = [format.vcodec, format.acodec]
    .filter((codec) => codec && codec !== "none")
    .join(", ");

  return codecs
    ? `${mediaKind}/${format.ext}; codecs="${codecs}"`
    : `${mediaKind}/${format.ext || "mp4"}`;
}

function normalizeThumbnails(
  videoId: string,
  thumbnails: YTDlpThumbnail[] | undefined
): YTThumbnail[] {
  const fallback = [
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

function selectFormats(info: YTDlpInfo): YTFormat[] {
  const mp4Formats = info.formats.filter(
    (format) => format.ext === "mp4" && format.vcodec && format.vcodec !== "none"
  );
  const candidateFormats =
    mp4Formats.length > 0
      ? mp4Formats
      : info.formats.filter(
          (format) => !!format.ext && format.vcodec && format.vcodec !== "none"
        );

  const mapped = candidateFormats.map<YTFormat>((format) => ({
    itag: format.format_id,
    quality: buildQualityLabel(format),
    qualityLabel: buildQualityLabel(format),
    mimeType: buildMimeType(format),
    bitrate: Math.round((format.tbr || 0) * 1000),
    width: format.width,
    height: format.height,
    fps: format.fps,
    hasAudio: !!format.acodec && format.acodec !== "none",
    hasVideo: !!format.vcodec && format.vcodec !== "none",
    contentLength: String(format.filesize || format.filesize_approx || ""),
    container: format.ext || "mp4",
    isMuxed:
      !!format.acodec &&
      format.acodec !== "none" &&
      !!format.vcodec &&
      format.vcodec !== "none",
  }));

  const deduped = mapped
    .sort((left, right) => {
      const heightDelta = (right.height || 0) - (left.height || 0);
      if (heightDelta !== 0) return heightDelta;

      const fpsDelta = (right.fps || 0) - (left.fps || 0);
      if (fpsDelta !== 0) return fpsDelta;

      if (left.isMuxed !== right.isMuxed) {
        return left.isMuxed ? 1 : -1;
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

  let info: YTDlpInfo;

  try {
    info = (await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      skipDownload: true,
      noPlaylist: true,
    })) as YTDlpInfo;
  } catch (error) {
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr.trim()
        : "";
    const message =
      error instanceof Error
        ? error.message.trim()
        : typeof error === "string"
          ? error.trim()
          : "";

    throw new Error(message || stderr || "Failed to extract YouTube formats");
  }

  const thumbnails = normalizeThumbnails(videoId, info.thumbnails);
  const formats = selectFormats(info);

  return {
    id: info.id || videoId,
    title: info.title,
    author: info.uploader || "",
    authorUrl: info.uploader_url || "",
    thumbnail: thumbnails[0]?.url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    duration: formatDuration(info.duration),
    viewCount: String(info.view_count || ""),
    description: info.description || "",
    formats,
    thumbnails,
  };
}

export function buildYouTubeDownloadSelector(format: YTFormat): string {
  if (format.isMuxed) {
    return format.itag;
  }

  if (format.container === "mp4") {
    return `${format.itag}+bestaudio[ext=m4a]/${format.itag}+bestaudio`;
  }

  return `${format.itag}+bestaudio/${format.itag}`;
}

export function buildYouTubeFilename(title: string, format: YTFormat): string {
  return sanitizeFilename(
    `${title}_${format.qualityLabel}${format.isMuxed ? "" : "_max"}.${format.container || "mp4"}`
  );
}
