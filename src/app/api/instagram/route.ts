import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
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
  const shortcode = extractInstagramShortcode(url);

  if (!normalizedUrl || !shortcode) {
    throw new Error("Invalid Instagram URL");
  }

  const [oembed, embedHtml] = await Promise.all([
    fetchOEmbed(normalizedUrl),
    fetchEmbedHtml(normalizedUrl),
  ]);

  const embedData = extractMediaFromEmbed(embedHtml, shortcode);
  const caption = embedData.caption || oembed?.title || "";
  const author = embedData.author || oembed?.author_name || "";

  return {
    shortcode,
    caption,
    author,
    authorPic: embedData.authorPic,
    timestamp: embedData.timestamp,
    likeCount: embedData.likeCount,
    commentCount: embedData.commentCount,
    isCarousel: embedData.media.length > 1,
    media: embedData.media,
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch Instagram data" },
      { status: 500 }
    );
  }
}
