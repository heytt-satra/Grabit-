import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { normalizeLinkedInUrl } from "@/lib/platforms";

export interface LinkedInPostData {
  title: string;
  description: string;
  author: string;
  authorImage: string;
  image: string;
  videoUrl: string | null;
  documentImages: string[];
  type: "video" | "image" | "document" | "text";
}

interface LinkedInSchemaImage {
  url?: string;
}

interface LinkedInSchemaPerson {
  name?: string;
}

interface LinkedInSchema {
  headline?: string;
  articleBody?: string;
  image?: LinkedInSchemaImage;
  author?: LinkedInSchemaPerson;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeHtml(value: string): string {
  return cheerio.load(`<div>${value}</div>`)("div").text().trim();
}

function parseJsonLd($: cheerio.CheerioAPI): LinkedInSchema | null {
  const scripts = $('script[type="application/ld+json"]').toArray();

  for (const script of scripts) {
    try {
      const payload = JSON.parse($(script).text()) as LinkedInSchema & {
        "@type"?: string;
      };
      if (payload["@type"] === "SocialMediaPosting") {
        return payload;
      }
    } catch {
      // Ignore malformed payloads.
    }
  }

  return null;
}

function collectDocumentImages($: cheerio.CheerioAPI): string[] {
  const images = new Set<string>();

  $("img").each((_, element) => {
    const src = $(element).attr("src") || $(element).attr("data-delayed-url") || "";
    const decoded = decodeHtml(src);

    if (!decoded.includes("/dms/image/")) return;
    if (/profile-displayphoto|company-logo|logo|icon|favicon/i.test(decoded)) return;

    images.add(decoded);
  });

  return Array.from(images);
}

function extractVideoUrl($: cheerio.CheerioAPI, html: string): string | null {
  const metaVideo =
    $('meta[property="og:video"]').attr("content") ||
    $('meta[property="og:video:url"]').attr("content");

  if (metaVideo) {
    return decodeHtml(metaVideo);
  }

  const patterns = [
    /"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/,
    /"progressiveUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/,
    /"streamingUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return null;
}

async function fetchLinkedInData(url: string): Promise<LinkedInPostData> {
  const normalizedUrl = normalizeLinkedInUrl(url);

  if (!normalizedUrl) {
    throw new Error("Invalid LinkedIn URL");
  }

  const response = await fetch(normalizedUrl, {
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
  const schema = parseJsonLd($);

  const ogTitle = decodeHtml($('meta[property="og:title"]').attr("content") || "");
  const ogDescription = decodeHtml(
    $('meta[property="og:description"]').attr("content") || ""
  );
  const ogImage = decodeHtml($('meta[property="og:image"]').attr("content") || "");

  const title = schema?.headline || ogTitle;
  const description = schema?.articleBody || ogDescription;
  const author =
    schema?.author?.name ||
    decodeHtml(
      ogTitle.match(/^(.+?)(?:\s+\|\s+.+LinkedIn| posted on the topic)/)?.[1] || ""
    );
  const image = schema?.image?.url || ogImage;
  const documentImages = collectDocumentImages($);
  const videoUrl = extractVideoUrl($, html);

  let type: LinkedInPostData["type"] = "text";
  if (videoUrl) type = "video";
  else if (documentImages.length > 1) type = "document";
  else if (image) type = "image";

  return {
    title,
    description,
    author,
    authorImage: "",
    image,
    videoUrl,
    documentImages,
    type,
  };
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  if (!normalizeLinkedInUrl(url)) {
    return NextResponse.json({ error: "Invalid LinkedIn URL" }, { status: 400 });
  }

  try {
    const data = await fetchLinkedInData(url);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch LinkedIn data" },
      { status: 500 }
    );
  }
}
