import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { normalizeLinkedInUrl } from "@/lib/platforms";

export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Extract the best video URL from a LinkedIn post page.
 * Parses the HTML to find video sources in JSON-LD, <video data-sources>,
 * og:video meta tags, and inline CDN URLs.
 */
async function extractLinkedInVideoUrl(pageUrl: string): Promise<string | null> {
  const response = await fetch(pageUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch LinkedIn page: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  interface VideoCandidate {
    url: string;
    height: number;
  }

  const candidates: VideoCandidate[] = [];

  // 1. Check <video data-sources> attribute
  const videoSources = $("video[data-sources]").first().attr("data-sources");
  if (videoSources) {
    try {
      const parsed = JSON.parse(videoSources) as Array<{
        src?: string;
        type?: string;
      }>;
      for (const source of parsed) {
        if (source.src && /\.mp4/i.test(source.src)) {
          const h = Number(source.src.match(/mp4-(\d+)p/i)?.[1] || 0);
          candidates.push({ url: source.src, height: h });
        }
      }
    } catch {
      // Fall through
    }
  }

  // 2. Check JSON-LD
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    try {
      const payload = JSON.parse($(script).text()) as {
        "@type"?: string;
        contentUrl?: string;
      };
      if (payload.contentUrl && /\.mp4/i.test(payload.contentUrl)) {
        const h = Number(
          payload.contentUrl.match(/mp4-(\d+)p/i)?.[1] || 0
        );
        candidates.push({
          url: payload.contentUrl
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&"),
          height: h,
        });
      }
    } catch {
      // Ignore malformed
    }
  }

  // 3. Check og:video meta tags
  const metaVideo =
    $('meta[property="og:video"]').attr("content") ||
    $('meta[property="og:video:url"]').attr("content");
  if (metaVideo && /\.mp4/i.test(metaVideo)) {
    const h = Number(metaVideo.match(/mp4-(\d+)p/i)?.[1] || 0);
    candidates.push({ url: metaVideo, height: h });
  }

  // 4. Regex scan for LinkedIn video CDN URLs
  const primaryHtml = html.slice(0, 120_000);
  for (const match of primaryHtml.matchAll(
    /https:\/\/dms\.licdn\.com\/playlist\/vid\/v2\/[^"'\\\s<]+?mp4-(\d+)p[^"'\\\s<]*/g
  )) {
    candidates.push({
      url: match[0]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
      height: Number(match[1] || 0),
    });
  }

  if (candidates.length === 0) return null;

  // Pick highest quality
  candidates.sort((a, b) => b.height - a.height);
  return candidates[0].url;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const normalizedUrl = normalizeLinkedInUrl(url);
  if (!normalizedUrl) {
    return NextResponse.json(
      { error: "Invalid LinkedIn URL" },
      { status: 400 }
    );
  }

  try {
    // Extract the direct video CDN URL from the page
    const videoUrl = await extractLinkedInVideoUrl(normalizedUrl);

    if (!videoUrl) {
      return NextResponse.json(
        { error: "No video found in this LinkedIn post" },
        { status: 404 }
      );
    }

    // Proxy-download the video from LinkedIn CDN
    const videoResponse = await fetch(videoUrl, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.linkedin.com/",
      },
    });

    if (!videoResponse.ok || !videoResponse.body) {
      return NextResponse.json(
        { error: `Failed to download video: ${videoResponse.status}` },
        { status: videoResponse.status }
      );
    }

    const contentType =
      videoResponse.headers.get("content-type") || "video/mp4";
    const contentLength = videoResponse.headers.get("content-length");

    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": 'attachment; filename="linkedin_video.mp4"',
      "Cache-Control": "no-store",
    });

    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new NextResponse(videoResponse.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message || String(err) : String(err);
    return NextResponse.json(
      { error: message || "Failed to download LinkedIn video" },
      { status: 500 }
    );
  }
}
