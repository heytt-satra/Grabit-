import { Innertube, Platform } from "youtubei.js";

let instance: Awaited<ReturnType<typeof Innertube.create>> | null = null;
let instanceCreatedAt = 0;

// Recreate instance every 30 minutes to avoid stale sessions
const INSTANCE_TTL_MS = 30 * 60 * 1000;

function setupEvaluator() {
  Platform.shim.eval = async (
    data: { output: string },
    env: Record<string, string>
  ) => {
    const properties: string[] = [];

    if (env.n) {
      properties.push(`n: exportedVars.nFunction("${env.n}")`);
    }

    if (env.sig) {
      properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
    }

    const code = `${data.output}\nreturn { ${properties.join(", ")} }`;
    return new Function(code)();
  };
}

export async function getInnertube(forceNew = false) {
  const now = Date.now();
  if (!instance || forceNew || now - instanceCreatedAt > INSTANCE_TTL_MS) {
    setupEvaluator();
    instance = await Innertube.create();
    instanceCreatedAt = now;
  }
  return instance;
}

export interface DecipheredFormat {
  itag: number;
  url: string;
  mimeType: string;
  bitrate: number;
  width?: number;
  height?: number;
  fps?: number;
  qualityLabel: string;
  contentLength: string;
  hasAudio: boolean;
  hasVideo: boolean;
  container: string;
  isMuxed: boolean;
  audioCodec?: string;
  videoCodec?: string;
}

export interface YouTubeVideoData {
  id: string;
  title: string;
  description: string;
  duration: number;
  viewCount: string;
  author: string;
  authorUrl: string;
  thumbnails: Array<{ url: string; width: number; height: number }>;
  formats: DecipheredFormat[];
  bestAudioUrl: string | null;
}

function inferContainer(mimeType?: string): string {
  if (!mimeType) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("3gpp")) return "3gp";
  return "mp4";
}

function extractCodec(mimeType?: string): string {
  if (!mimeType) return "";
  const match = mimeType.match(/codecs="([^"]+)"/);
  return match ? match[1] : "";
}

// Clients to try in order of preference
const CLIENTS_TO_TRY = ["WEB", "ANDROID", "TV_EMBEDDED"] as const;

type ClientName = (typeof CLIENTS_TO_TRY)[number];

async function fetchWithClient(
  yt: Awaited<ReturnType<typeof Innertube.create>>,
  videoId: string,
  client: ClientName
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info = await yt.getBasicInfo(videoId, { client: client as any });
  if (!info.streaming_data) {
    throw new Error(
      `No streaming data from ${client} client. The video may be private, age-restricted, or unavailable.`
    );
  }
  return info;
}

export async function fetchYouTubeData(
  videoId: string
): Promise<YouTubeVideoData> {
  let lastError: Error | null = null;

  // Try with existing instance first, then force-new on failure
  for (const forceNew of [false, true]) {
    const yt = await getInnertube(forceNew);
    const player = yt.session.player;

    for (const client of CLIENTS_TO_TRY) {
      try {
        const info = await fetchWithClient(yt, videoId, client);

        const sd = info.streaming_data!;
        const rawFormats = [
          ...(sd.formats || []),
          ...(sd.adaptive_formats || []),
        ];

        // Decipher all format URLs
        for (const f of rawFormats) {
          if (!f.url) {
            try {
              f.url = await f.decipher(player);
            } catch {
              // some formats may not need deciphering or fail
            }
          }
        }

        const formats: DecipheredFormat[] = rawFormats
          .filter((f) => f.has_video && !!f.url)
          .map((f) => {
            const container = inferContainer(f.mime_type);
            const codecs = extractCodec(f.mime_type);
            return {
              itag: f.itag,
              url: f.url!,
              mimeType: f.mime_type || `video/${container}`,
              bitrate: f.bitrate || 0,
              width: f.width,
              height: f.height,
              fps: f.fps,
              qualityLabel:
                f.quality_label || (f.height ? `${f.height}p` : String(f.itag)),
              contentLength: f.content_length ? String(f.content_length) : "",
              hasAudio: f.has_audio,
              hasVideo: f.has_video,
              container,
              isMuxed: f.has_audio && f.has_video,
              audioCodec: f.has_audio ? codecs.split(",").pop()?.trim() : undefined,
              videoCodec: f.has_video ? codecs.split(",")[0]?.trim() : undefined,
            };
          });

        if (formats.length === 0) {
          throw new Error(
            "No playable YouTube formats were returned for this video"
          );
        }

        // Find best audio format URL for muxing
        const audioFormats = rawFormats
          .filter((f) => f.has_audio && !f.has_video && !!f.url)
          .sort((a, b) => {
            // Prefer m4a for mp4 container compatibility
            const aIsM4a = a.mime_type?.includes("mp4") ? 1 : 0;
            const bIsM4a = b.mime_type?.includes("mp4") ? 1 : 0;
            if (aIsM4a !== bIsM4a) return bIsM4a - aIsM4a;
            return (b.bitrate || 0) - (a.bitrate || 0);
          });

        const bestAudioUrl = audioFormats[0]?.url || null;

        return {
          id: info.basic_info.id || videoId,
          title: info.basic_info.title || "YouTube video",
          description: info.basic_info.short_description || "",
          duration: info.basic_info.duration || 0,
          viewCount: info.basic_info.view_count
            ? String(info.basic_info.view_count)
            : "",
          author: info.basic_info.author || "",
          authorUrl: info.basic_info.channel
            ? `https://www.youtube.com/channel/${info.basic_info.channel?.id || ""}`
            : "",
          thumbnails: info.basic_info.thumbnail || [],
          formats,
          bestAudioUrl,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Continue to next client
      }
    }

    // If all clients failed with the current instance, try with a fresh one
    if (!forceNew) {
      continue;
    }
  }

  throw lastError || new Error("Failed to fetch YouTube data after all attempts");
}

export async function getAudioFormatUrl(
  videoId: string
): Promise<string | null> {
  // This now piggybacks on fetchYouTubeData which already resolves best audio
  const data = await fetchYouTubeData(videoId);
  return data.bestAudioUrl;
}
