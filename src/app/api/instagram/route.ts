import { NextRequest, NextResponse } from "next/server";
import { load } from "cheerio";
import {
  instagramGetUrl,
  type InstagramResponse,
} from "instagram-url-direct";
import {
  extractInstagramShortcode,
  getInstagramType,
  normalizeInstagramUrl,
} from "@/lib/platforms";
import { hasYtDlpBinary, runYtDlp } from "@/lib/yt-dlp";

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

interface YtDlpFormat {
  format_id?: string;
  url?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  width?: number;
  tbr?: number;
}

interface YtDlpThumbnail {
  url?: string;
  width?: number;
  height?: number;
}

interface YtDlpResponse {
  id: string;
  title?: string;
  description?: string;
  uploader?: string;
  like_count?: number;
  comment_count?: number;
  thumbnail?: string;
  thumbnails?: YtDlpThumbnail[];
  formats?: YtDlpFormat[];
}

export const runtime = "nodejs";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function dedupeMedia(media: InstaMedia[]) {
  return media.filter(
    (item, index, collection) =>
      collection.findIndex((candidate) => candidate.url === item.url) === index
  );
}

function decodeHtml(value: string) {
  return load(`<div>${value}</div>`)("div").text().trim();
}

function parseAbbreviatedNumber(value?: string | null) {
  if (!value) return 0;

  const cleaned = value.replace(/,/g, "").trim().toUpperCase();
  const match = cleaned.match(/^([\d.]+)\s*([KMB])?$/);
  if (!match) {
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;

  const multiplier =
    match[2] === "B" ? 1_000_000_000 : match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;

  return Math.round(amount * multiplier);
}

function buildInstaPostData(
  shortcode: string,
  input: Partial<Omit<InstaPostData, "shortcode">> & { media: InstaMedia[] }
): InstaPostData {
  const media = dedupeMedia(input.media.filter((item) => !!item.url));

  return {
    shortcode,
    caption: input.caption || "",
    author: input.author || "",
    authorPic: input.authorPic || "",
    timestamp: input.timestamp || "",
    likeCount: input.likeCount || 0,
    commentCount: input.commentCount || 0,
    isCarousel: media.length > 1,
    media,
  };
}

function mapInstagramMedia(response: InstagramResponse): InstaMedia[] {
  return dedupeMedia(
    response.media_details
      .map<InstaMedia | null>((media) => {
        if (!media.url) return null;

        if (media.type === "video") {
          return {
            type: "video",
            url: media.url,
            thumbnail: media.thumbnail || undefined,
          };
        }

        return {
          type: "image",
          url: media.url,
          thumbnail: media.thumbnail || undefined,
        };
      })
      .filter((media): media is InstaMedia => Boolean(media))
  );
}

async function resolveInstagramUrl(url: string) {
  const normalizedUrl = normalizeInstagramUrl(url);
  if (normalizedUrl) return normalizedUrl;

  try {
    const parsed = new URL(url.trim());
    if (!parsed.hostname.toLowerCase().includes("instagram.com")) return null;
    if (!parsed.pathname.toLowerCase().includes("/share/")) return null;

    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
      redirect: "follow",
    });

    return normalizeInstagramUrl(response.url);
  } catch {
    return null;
  }
}

async function extractWithInstagramDirect(
  normalizedUrl: string,
  shortcode: string
) {
  const response = await instagramGetUrl(normalizedUrl, {
    retries: 4,
    delay: 750,
  });
  const media = mapInstagramMedia(response);

  if (media.length === 0) {
    throw new Error("instagram-url-direct returned no media");
  }

  return buildInstaPostData(shortcode, {
    caption: response.post_info.caption || "",
    author:
      response.post_info.owner_username ||
      response.post_info.owner_fullname ||
      "",
    likeCount: response.post_info.likes || 0,
    media,
  });
}

function getBestYtDlpVideoUrl(data: YtDlpResponse) {
  const candidates = (data.formats || [])
    .filter((format) => format.url && format.vcodec !== "none")
    .sort((left, right) => {
      const heightDelta = (right.height || 0) - (left.height || 0);
      if (heightDelta !== 0) return heightDelta;

      if ((left.acodec !== "none") !== (right.acodec !== "none")) {
        return left.acodec !== "none" ? -1 : 1;
      }

      if ((left.ext || "") !== (right.ext || "")) {
        return left.ext === "mp4" ? -1 : 1;
      }

      return (right.tbr || 0) - (left.tbr || 0);
    });

  return candidates[0]?.url || null;
}

function getBestThumbnail(data: YtDlpResponse) {
  const thumbnails = [...(data.thumbnails || [])].sort(
    (left, right) =>
      (right.width || 0) * (right.height || 0) -
      (left.width || 0) * (left.height || 0)
  );

  return thumbnails[0]?.url || data.thumbnail || undefined;
}

async function extractWithYtDlp(
  normalizedUrl: string,
  shortcode: string,
  signal: AbortSignal
) {
  if (!hasYtDlpBinary()) return null;

  try {
    const { stdout } = await runYtDlp(
      [normalizedUrl, "--dump-single-json", "--no-warnings", "--no-playlist"],
      { signal }
    );
    const data = JSON.parse(stdout) as YtDlpResponse;
    const videoUrl = getBestYtDlpVideoUrl(data);

    if (!videoUrl) return null;

    return buildInstaPostData(shortcode, {
      caption: data.description || "",
      author: data.uploader || "",
      likeCount: data.like_count || 0,
      commentCount: data.comment_count || 0,
      media: [
        {
          type: "video",
          url: videoUrl,
          thumbnail: getBestThumbnail(data),
        },
      ],
    });
  } catch {
    return null;
  }
}

async function extractWithHtml(normalizedUrl: string, shortcode: string) {
  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = load(html);

    const imageUrl = $('meta[property="og:image"]').attr("content");
    const videoUrl =
      $('meta[property="og:video"]').attr("content") ||
      $('meta[property="og:video:secure_url"]').attr("content");
    const title = $('meta[property="og:title"]').attr("content") || "";
    const description = $('meta[name="description"]').attr("content") || "";
    const decodedTitle = decodeHtml(title);
    const decodedDescription = decodeHtml(description);
    const authorFromTitle = decodedTitle.match(/^(.*?) on Instagram:/)?.[1] || "";
    const authorFromDescription =
      decodedDescription.match(/-\s*([^\s]+)\s+on\s+[^:]+:/)?.[1] || "";
    const caption =
      decodedDescription.match(/:\s*"([\s\S]*)"\.?\s*$/)?.[1] || "";
    const likeCount = parseAbbreviatedNumber(
      decodedDescription.match(/^([^,]+)\s+likes/i)?.[1]
    );
    const commentCount = parseAbbreviatedNumber(
      decodedDescription.match(/,\s*([^,]+)\s+comments/i)?.[1]
    );
    const media: InstaMedia[] = [];

    if (videoUrl) {
      media.push({
        type: "video",
        url: videoUrl,
        thumbnail: imageUrl || undefined,
      });
    } else if (imageUrl) {
      media.push({
        type: "image",
        url: imageUrl,
        thumbnail: imageUrl || undefined,
      });
    }

    if (media.length === 0) return null;

    return buildInstaPostData(shortcode, {
      caption,
      author: authorFromDescription || authorFromTitle,
      likeCount,
      commentCount,
      media,
    });
  } catch {
    return null;
  }
}

async function fetchInstaData(url: string, signal: AbortSignal): Promise<InstaPostData> {
  const normalizedUrl = await resolveInstagramUrl(url);
  const shortcode = normalizedUrl
    ? extractInstagramShortcode(normalizedUrl)
    : extractInstagramShortcode(url);

  if (!normalizedUrl || !shortcode) {
    throw new Error("Invalid Instagram URL");
  }

  const extractorErrors: string[] = [];

  try {
    return await extractWithInstagramDirect(normalizedUrl, shortcode);
  } catch (error) {
    extractorErrors.push(
      error instanceof Error ? error.message : String(error)
    );
  }

  const instagramType = getInstagramType(normalizedUrl);
  if (instagramType === "reel" || instagramType === "post") {
    const ytDlpData = await extractWithYtDlp(normalizedUrl, shortcode, signal);
    if (ytDlpData) return ytDlpData;
  }

  const htmlData = await extractWithHtml(normalizedUrl, shortcode);
  if (htmlData) return htmlData;

  const combinedError = extractorErrors.join(" | ");
  if (/not found|private|deleted|login/i.test(combinedError)) {
    throw new Error("Could not extract media. The post may be private or deleted.");
  }

  throw new Error(
    "Could not extract Instagram media right now. Try again in a moment with a public post."
  );
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const data = await fetchInstaData(url, request.signal);

    if (data.media.length === 0) {
      return NextResponse.json(
        { error: "Could not extract media. The post may be private or deleted." },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Instagram data";
    const status = message === "Invalid Instagram URL" ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
