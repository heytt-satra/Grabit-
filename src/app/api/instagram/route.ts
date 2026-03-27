import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import youtubedl from "youtube-dl-exec";
import {
  extractInstagramShortcode,
  normalizeInstagramUrl,
} from "@/lib/platforms";

export interface InstaMedia {
  type: "image" | "video";
  url: string;
  thumbnail?: string;
}

export interface InstaPostData {
  shortcode: string;
  caption: string;
  author: string;
  authorPic: string;
  timestamp: string;
  likeCount: number;
  commentCount: number;
  isCarousel: boolean;
  media: InstaMedia[];
}

interface InstaOEmbed {
  author_name?: string;
  title?: string;
}

interface YTDlpThumbnail {
  url?: string;
  width?: number;
  height?: number;
}

interface YTDlpFormat {
  url?: string;
  ext?: string;
  width?: number;
  height?: number;
  filesize?: number;
  filesize_approx?: number;
  acodec?: string;
  vcodec?: string;
}

interface YTDlpInstagramInfo {
  _type?: string;
  id?: string;
  title?: string;
  description?: string;
  uploader?: string;
  thumbnail?: string;
  thumbnails?: YTDlpThumbnail[];
  timestamp?: number;
  like_count?: number;
  comment_count?: number;
  ext?: string;
  url?: string;
  acodec?: string;
  vcodec?: string;
  formats?: YTDlpFormat[];
  entries?: YTDlpInstagramInfo[];
}

const UA =
  "Mozilla/5.0";

export const runtime = "nodejs";

function extractBetween(
  text: string,
  startNeedle: string,
  endNeedle: string
): string | null {
  const start = text.indexOf(startNeedle);
  if (start < 0) return null;

  const from = start + startNeedle.length;
  const end = text.indexOf(endNeedle, from);
  if (end < 0) return null;

  return text.slice(from, end);
}

function decodeEscapedValue(raw: string | null): string {
  if (!raw) return "";

  let decoded = raw;
  for (let i = 0; i < 2; i += 1) {
    try {
      decoded = JSON.parse(`"${decoded.replace(/"/g, '\\"')}"`) as string;
    } catch {
      break;
    }
  }

  return decoded.replace(/\\\//g, "/");
}

function findBalancedSection(text: string, startIndex: number): string | null {
  if (startIndex < 0 || startIndex >= text.length) return null;

  let depth = 0;
  let started = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];

    if (char === "{" || char === "[") {
      depth += 1;
      started = true;
      continue;
    }

    if (char === "}" || char === "]") {
      depth -= 1;
      if (started && depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }

  return null;
}

function extractMediaFromEmbed(html: string, shortcode: string): Omit<
  InstaPostData,
  "shortcode" | "isCarousel"
> {
  const shortcodeNeedle = `\\"shortcode\\":\\"${shortcode}\\"`;
  const shortcodeIndex = html.indexOf(shortcodeNeedle);

  if (shortcodeIndex === -1) {
    throw new Error("Could not locate Instagram media data in the embed page");
  }

  const slice = html.slice(
    Math.max(0, shortcodeIndex - 15_000),
    shortcodeIndex + 220_000
  );
  const fromShortcode = slice.slice(slice.indexOf(shortcodeNeedle));

  const author = decodeEscapedValue(
    extractBetween(slice, '\\"username\\":\\"', '\\"')
  );
  const authorPic = decodeEscapedValue(
    extractBetween(slice, '\\"profile_pic_url\\":\\"', '\\"')
  );
  const caption = decodeEscapedValue(
    extractBetween(
      slice.slice(Math.max(0, slice.indexOf('\\"edge_media_to_caption\\"'))),
      '\\"text\\":\\"',
      '\\"}}]}'
    )
  );
  const timestamp =
    extractBetween(slice, '\\"taken_at_timestamp\\":', ",") ||
    extractBetween(slice, '\\"taken_at\\":', ",") ||
    "";
  const likeCount = Number(
    extractBetween(slice, '\\"edge_liked_by\\":{\\"count\\":', "}") || 0
  );
  const commentCount = Number(
    extractBetween(slice, '\\"edge_media_to_comment\\":{\\"count\\":', "}") || 0
  );

  const media: InstaMedia[] = [];
  const sidecarKey = '\\"edge_sidecar_to_children\\":';
  const sidecarIndex = fromShortcode.indexOf(sidecarKey);

  if (sidecarIndex >= 0) {
    const sectionStart = fromShortcode.indexOf("{", sidecarIndex + sidecarKey.length);
    const sidecarSection = findBalancedSection(fromShortcode, sectionStart) || "";

    for (const part of sidecarSection.split('{\\"node\\":{').slice(1)) {
      const block = part.slice(0, 12_000);
      const displayUrl = decodeEscapedValue(
        extractBetween(block, '\\"display_url\\":\\"', '\\"')
      );
      const isVideo =
        extractBetween(block, '\\"is_video\\":', ",") === "true";
      const videoUrl = isVideo
        ? decodeEscapedValue(
            extractBetween(block, '\\"video_url\\":\\"', '\\"')
          )
        : "";

      if (isVideo && videoUrl) {
        media.push({
          type: "video",
          url: videoUrl,
          thumbnail: displayUrl || undefined,
        });
        continue;
      }

      if (displayUrl) {
        media.push({ type: "image", url: displayUrl });
      }
    }
  } else {
    const block = fromShortcode.slice(0, 60_000);
    const displayUrl = decodeEscapedValue(
      extractBetween(block, '\\"display_url\\":\\"', '\\"')
    );
    const isVideo =
      extractBetween(block, '\\"is_video\\":', ",") === "true";
    const videoUrl = isVideo
      ? decodeEscapedValue(
          extractBetween(block, '\\"video_url\\":\\"', '\\"')
        )
      : "";

    if (isVideo && videoUrl) {
      media.push({
        type: "video",
        url: videoUrl,
        thumbnail: displayUrl || undefined,
      });
    } else if (displayUrl) {
      media.push({ type: "image", url: displayUrl });
    }
  }

  const uniqueMedia = media.filter(
    (item, index, items) =>
      item.url &&
      items.findIndex((candidate) => candidate.url === item.url) === index
  );

  return {
    caption,
    author,
    authorPic,
    timestamp,
    likeCount,
    commentCount,
    media: uniqueMedia,
  };
}

function hasAudio(value: { acodec?: string }): boolean {
  return Boolean(value.acodec && value.acodec !== "none");
}

function hasVideo(value: { vcodec?: string; ext?: string }): boolean {
  return Boolean(
    (value.vcodec && value.vcodec !== "none") ||
      value.ext === "mp4"
  );
}

function pickBestThumbnail(
  thumbnail: string | undefined,
  thumbnails: YTDlpThumbnail[] | undefined
): string | undefined {
  if (thumbnail) return thumbnail;

  return thumbnails
    ?.filter((item) => !!item.url)
    .sort(
      (left, right) =>
        (right.width || 0) * (right.height || 0) -
        (left.width || 0) * (left.height || 0)
    )[0]?.url;
}

function pickBestVideoFormat(formats: YTDlpFormat[] | undefined): YTDlpFormat | null {
  if (!formats?.length) return null;

  const candidates = formats.filter((format) => !!format.url && hasVideo(format));
  if (candidates.length === 0) return null;

  return candidates.sort((left, right) => {
    const leftMuxed = Number(hasAudio(left));
    const rightMuxed = Number(hasAudio(right));
    if (leftMuxed !== rightMuxed) return rightMuxed - leftMuxed;

    const heightDelta = (right.height || 0) - (left.height || 0);
    if (heightDelta !== 0) return heightDelta;

    const widthDelta = (right.width || 0) - (left.width || 0);
    if (widthDelta !== 0) return widthDelta;

    return (right.filesize || right.filesize_approx || 0) - (left.filesize || left.filesize_approx || 0);
  })[0];
}

function mapYtdlpMedia(entry: YTDlpInstagramInfo): InstaMedia | null {
  const thumbnail = pickBestThumbnail(entry.thumbnail, entry.thumbnails);
  const bestVideo = pickBestVideoFormat(entry.formats);
  const directVideoUrl = bestVideo?.url || (hasVideo(entry) ? entry.url : undefined);

  if (directVideoUrl) {
    return {
      type: "video",
      url: directVideoUrl,
      thumbnail,
    };
  }

  const imageUrl = entry.url || thumbnail;
  if (!imageUrl) return null;

  return {
    type: "image",
    url: imageUrl,
  };
}

async function fetchMediaFromYtdlp(url: string): Promise<Omit<
  InstaPostData,
  "shortcode" | "isCarousel"
>> {
  let info: YTDlpInstagramInfo;

  try {
    info = (await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      skipDownload: true,
    })) as YTDlpInstagramInfo;
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

    throw new Error(message || stderr || "Failed to extract Instagram media");
  }

  const primaryEntry = info.entries?.find(Boolean);
  const mediaEntries =
    info._type === "playlist" && info.entries?.length ? info.entries : [info];
  const media = mediaEntries
    .map((entry) => mapYtdlpMedia(entry))
    .filter(
      (entry, index, collection): entry is InstaMedia =>
        Boolean(entry?.url) &&
        collection.findIndex((candidate) => candidate?.url === entry?.url) ===
          index
    );
  const source = primaryEntry || info;

  return {
    caption: info.description || source.description || "",
    author: info.uploader || source.uploader || "",
    authorPic: "",
    timestamp: String(info.timestamp || source.timestamp || ""),
    likeCount: Number(info.like_count || source.like_count || 0),
    commentCount: Number(info.comment_count || source.comment_count || 0),
    media,
  };
}

async function fetchOEmbed(url: string): Promise<InstaOEmbed | null> {
  const oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}`;

  try {
    const response = await requestRemote(oembedUrl);

    if (response.status < 200 || response.status >= 300) return null;
    return JSON.parse(response.body) as InstaOEmbed;
  } catch {
    return null;
  }
}

async function fetchEmbedHtml(url: string): Promise<string> {
  const embedUrls = [`${url}embed/captioned/`, `${url}embed/`];

  for (const embedUrl of embedUrls) {
    const response = await requestRemote(embedUrl);
    if (response.status < 200 || response.status >= 300) continue;

    const html = response.body;
    if (html.includes('\\"display_url\\":\\"') || html.includes('\\"video_url\\":\\"')) {
      return html;
    }
  }

  throw new Error("Could not extract Instagram media from the public embed");
}

async function requestRemote(
  url: string,
  redirectCount = 0
): Promise<{ status: number; body: string }> {
  if (redirectCount > 5) {
    throw new Error("Too many Instagram redirects");
  }

  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        headers: {
          "User-Agent": UA,
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          const redirectedUrl = new URL(response.headers.location, url).toString();
          requestRemote(redirectedUrl, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode || 500,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    request.on("error", reject);
    request.end();
  });
}

async function fetchInstaData(url: string): Promise<InstaPostData> {
  const normalizedUrl = normalizeInstagramUrl(url);
  const shortcode = normalizedUrl
    ? extractInstagramShortcode(normalizedUrl)
    : extractInstagramShortcode(url);

  if (!normalizedUrl || !shortcode) {
    throw new Error("Invalid Instagram URL");
  }

  const oembedPromise = fetchOEmbed(normalizedUrl);
  let extractedData: Omit<InstaPostData, "shortcode" | "isCarousel"> | null = null;

  try {
    extractedData = await fetchMediaFromYtdlp(normalizedUrl);
  } catch {
    extractedData = null;
  }

  if (!extractedData || extractedData.media.length === 0) {
    try {
      const embedHtml = await fetchEmbedHtml(normalizedUrl);
      extractedData = extractMediaFromEmbed(embedHtml, shortcode);
    } catch {
      throw new Error("Could not extract media. The post may be private or deleted.");
    }
  }

  const oembed = await oembedPromise;
  const caption = extractedData.caption || oembed?.title || "";
  const author = extractedData.author || oembed?.author_name || "";

  return {
    shortcode,
    caption,
    author,
    authorPic: extractedData.authorPic,
    timestamp: extractedData.timestamp,
    likeCount: extractedData.likeCount,
    commentCount: extractedData.commentCount,
    isCarousel: extractedData.media.length > 1,
    media: extractedData.media,
  };
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  if (!normalizeInstagramUrl(url)) {
    return NextResponse.json({ error: "Invalid Instagram URL" }, { status: 400 });
  }

  try {
    const data = await fetchInstaData(url);

    if (data.media.length === 0) {
      return NextResponse.json(
        { error: "Could not extract media. The post may be private or deleted." },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch Instagram data";
    const status = message === "Invalid Instagram URL" ? 400 : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
