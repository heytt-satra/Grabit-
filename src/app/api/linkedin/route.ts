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
  videoQuality: string;
  documentImages: string[];
  documentPdfUrl: string | null;
  documentPageCount: number;
  type: "video" | "image" | "document" | "text";
}

interface LinkedInSchemaImage {
  url?: string;
}

interface LinkedInSchemaPerson {
  name?: string;
  image?: LinkedInSchemaImage;
}

interface LinkedInSchemaMediaObject {
  contentUrl?: string;
  encodingFormat?: string;
}

interface LinkedInSchema {
  headline?: string;
  articleBody?: string;
  image?: LinkedInSchemaImage;
  author?: LinkedInSchemaPerson;
  contentUrl?: string;
  caption?: LinkedInSchemaMediaObject;
}

interface LinkedInDocumentCoverPage {
  type?: string;
  config?: {
    src?: string;
  };
}

interface LinkedInNativeDocumentConfig {
  doc?: {
    authorTitle?: string;
    title?: string;
    totalPageCount?: number;
    manifestUrl?: string;
    url?: string;
    coverPages?: LinkedInDocumentCoverPage[];
  };
}

interface LinkedInDocumentManifestResolution {
  width?: number;
  height?: number;
  imageManifestUrl?: string;
}

interface LinkedInDocumentManifest {
  transcribedDocumentUrl?: string;
  perResolutions?: LinkedInDocumentManifestResolution[];
}

interface LinkedInDocumentImageManifest {
  pages?: string[];
}

interface LinkedInDocumentAssets {
  images: string[];
  pdfUrl: string | null;
  pageCount: number;
}

interface LinkedInVideoCandidate {
  url: string;
  quality: string;
  height: number;
}

interface LinkedInVideoSource {
  src?: string;
  type?: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const PRIMARY_MEDIA_SCAN_LIMIT = 120_000;

function decodeHtml(value: string): string {
  return cheerio.load(`<div>${value}</div>`)("div").text().trim();
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#47;/g, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
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

function getPrimaryMediaHtml(html: string): string {
  return html.slice(0, PRIMARY_MEDIA_SCAN_LIMIT);
}

function getImageArea(url: string): number {
  const match = url.match(/_(\d{2,5})(?:_(\d{2,5}))?(?=[/?&]|$)/);
  if (!match) return 0;

  const width = Number(match[1] || 0);
  const height = Number(match[2] || match[1] || 0);
  return width * height;
}

function pickBestImageUrl(...candidates: Array<string | null | undefined>): string {
  return candidates
    .map((candidate) => decodeHtmlAttribute(candidate || ""))
    .filter(Boolean)
    .sort((left, right) => getImageArea(right) - getImageArea(left))[0] || "";
}

function parseNativeDocumentConfig(html: string): LinkedInNativeDocumentConfig | null {
  const primaryHtml = getPrimaryMediaHtml(html);
  const match = primaryHtml.match(/data-native-document-config="([^"]+)"/);

  if (!match?.[1]) return null;

  try {
    return JSON.parse(decodeHtmlAttribute(match[1])) as LinkedInNativeDocumentConfig;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json,text/plain,*/*",
      Referer: "https://www.linkedin.com/",
    },
    redirect: "follow",
  });

  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function resolveDocumentAssets(
  config: LinkedInNativeDocumentConfig | null
): Promise<LinkedInDocumentAssets> {
  const coverImages =
    config?.doc?.coverPages
      ?.map((page) => decodeHtmlAttribute(page.config?.src || ""))
      .filter(Boolean) || [];
  const manifestUrl = decodeHtmlAttribute(config?.doc?.manifestUrl || config?.doc?.url || "");
  const manifest = manifestUrl
    ? await fetchJson<LinkedInDocumentManifest>(manifestUrl)
    : null;

  const bestResolution = manifest?.perResolutions
    ?.filter((resolution) => !!resolution.imageManifestUrl)
    .sort(
      (left, right) =>
        (right.width || 0) * (right.height || 0) -
        (left.width || 0) * (left.height || 0)
    )[0];
  const imageManifestUrl = decodeHtmlAttribute(bestResolution?.imageManifestUrl || "");
  const imageManifest = imageManifestUrl
    ? await fetchJson<LinkedInDocumentImageManifest>(imageManifestUrl)
    : null;
  const images =
    imageManifest?.pages?.map((page) => decodeHtmlAttribute(page)).filter(Boolean) ||
    coverImages;

  return {
    images,
    pdfUrl: decodeHtmlAttribute(manifest?.transcribedDocumentUrl || ""),
    pageCount: Number(config?.doc?.totalPageCount || images.length || coverImages.length || 0),
  };
}

function extractVideoCandidates(
  $: cheerio.CheerioAPI,
  schema: LinkedInSchema | null,
  html: string
): LinkedInVideoCandidate[] {
  const primaryHtml = getPrimaryMediaHtml(html);
  const urls = new Set<string>();
  const videoSources = $('video[data-sources]').first().attr("data-sources");

  if (videoSources) {
    try {
      const parsedSources = JSON.parse(videoSources) as LinkedInVideoSource[];
      for (const source of parsedSources) {
        if (source.src && /\.mp4/i.test(source.src)) {
          urls.add(source.src);
        }
      }
    } catch {
      // Fall through to regex-based extraction.
    }
  }

  if (schema?.contentUrl && /\.mp4/i.test(schema.contentUrl)) {
    urls.add(decodeHtmlAttribute(schema.contentUrl));
  }

  const metaVideo =
    $('meta[property="og:video"]').attr("content") ||
    $('meta[property="og:video:url"]').attr("content");
  if (metaVideo && /\.mp4/i.test(metaVideo)) {
    urls.add(decodeHtmlAttribute(metaVideo));
  }

  for (const match of primaryHtml.matchAll(/https:\/\/dms\.licdn\.com\/playlist\/vid\/v2\/[^"'\\s<]+?mp4-(\d+)p[^"'\\s<]*/g)) {
    urls.add(decodeHtmlAttribute(match[0]));
  }

  return Array.from(urls)
    .map((url) => {
      const height = Number(url.match(/mp4-(\d+)p/i)?.[1] || 0);
      return {
        url,
        quality: height > 0 ? `${height}p` : "MP4",
        height,
      };
    })
    .sort((left, right) => right.height - left.height);
}

function getVideoPoster($: cheerio.CheerioAPI, schema: LinkedInSchema | null, ogImage: string): string {
  return pickBestImageUrl(
    $('video[data-poster-url]').first().attr("data-poster-url"),
    schema?.image?.url,
    ogImage
  );
}

function getAuthorName(schema: LinkedInSchema | null, ogTitle: string, documentConfig: LinkedInNativeDocumentConfig | null): string {
  const headlineAuthor =
    schema?.headline?.match(/\|\s*([^|]+?)\s*\|\s*\d+\s+comments?/i)?.[1] || "";
  const ogTitleAuthor =
    decodeHtmlAttribute(ogTitle).match(/\|\s*([^|]+?)\s*\|\s*\d+\s+comments?/i)?.[1] || "";

  return (
    schema?.author?.name ||
    documentConfig?.doc?.authorTitle ||
    headlineAuthor ||
    ogTitleAuthor ||
    decodeHtml(
      ogTitle.match(/^(.+?)(?:\s+\|\s+.+LinkedIn| posted on the topic)/)?.[1] || ""
    )
  );
}

function getAuthorImage(schema: LinkedInSchema | null): string {
  return decodeHtmlAttribute(schema?.author?.image?.url || "");
}

function getPrimaryImage(schema: LinkedInSchema | null, ogImage: string): string {
  return pickBestImageUrl(schema?.image?.url, ogImage);
}

function getDocumentPreviewImage(documentAssets: LinkedInDocumentAssets): string {
  return documentAssets.images[0] || "";
}

function getDocumentTitle(
  schema: LinkedInSchema | null,
  ogTitle: string,
  documentConfig: LinkedInNativeDocumentConfig | null
): string {
  return documentConfig?.doc?.title || schema?.headline || ogTitle;
}

function getDocumentPdfUrl(documentAssets: LinkedInDocumentAssets): string | null {
  return documentAssets.pdfUrl || null;
}

function getDocumentPageCount(documentAssets: LinkedInDocumentAssets): number {
  return documentAssets.pageCount || documentAssets.images.length;
}

function getDocumentImages(documentAssets: LinkedInDocumentAssets): string[] {
  return documentAssets.images;
}

function getVideoData(
  $: cheerio.CheerioAPI,
  schema: LinkedInSchema | null,
  html: string,
  ogImage: string
): { url: string | null; quality: string; poster: string } {
  const candidates = extractVideoCandidates($, schema, html);
  const bestVideo = candidates[0];

  return {
    url: bestVideo?.url || null,
    quality: bestVideo?.quality || "",
    poster: getVideoPoster($, schema, ogImage),
  };
}

function getPostType(
  documentAssets: LinkedInDocumentAssets,
  videoUrl: string | null,
  image: string
): LinkedInPostData["type"] {
  if (documentAssets.pdfUrl || documentAssets.images.length > 0) return "document";
  if (videoUrl) return "video";
  if (image) return "image";
  return "text";
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
  const documentConfig = parseNativeDocumentConfig(html);
  const documentAssets = await resolveDocumentAssets(documentConfig);

  const ogTitle = decodeHtml($('meta[property="og:title"]').attr("content") || "");
  const ogDescription = decodeHtml(
    $('meta[property="og:description"]').attr("content") || ""
  );
  const ogImage = decodeHtmlAttribute($('meta[property="og:image"]').attr("content") || "");
  const videoData = getVideoData($, schema, html, ogImage);
  const previewImage =
    getPrimaryImage(schema, ogImage) ||
    videoData.poster ||
    getDocumentPreviewImage(documentAssets);
  const type = getPostType(documentAssets, videoData.url, previewImage);
  const image =
    type === "document"
      ? getDocumentPreviewImage(documentAssets) || previewImage
      : previewImage;
  const title =
    type === "document"
      ? getDocumentTitle(schema, ogTitle, documentConfig)
      : schema?.headline || ogTitle;
  const description = schema?.articleBody || ogDescription;
  const author = getAuthorName(schema, ogTitle, documentConfig);
  const authorImage = getAuthorImage(schema);

  return {
    title,
    description,
    author,
    authorImage,
    image,
    videoUrl: videoData.url,
    videoQuality: videoData.quality,
    documentImages: getDocumentImages(documentAssets),
    documentPdfUrl: getDocumentPdfUrl(documentAssets),
    documentPageCount: getDocumentPageCount(documentAssets),
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
