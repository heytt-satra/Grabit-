import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export interface PageMeta {
  title: string;
  description: string;
  siteName: string;
  favicon: string;
  image: string;
  author: string;
  publishedDate: string;
  url: string;
  domain: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function extractMeta(url: string): Promise<PageMeta> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch page: ${resp.status}`);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);
  const parsedUrl = new URL(resp.url || url);
  const domain = parsedUrl.hostname.replace("www.", "");

  const get = (selectors: string[]): string => {
    for (const sel of selectors) {
      const val = $(sel).attr("content") || $(sel).attr("value") || "";
      if (val.trim()) return val.trim();
    }
    return "";
  };

  const title =
    get(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    $("title").text().trim() ||
    "";

  const description =
    get([
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]) || "";

  const siteName =
    get(['meta[property="og:site_name"]']) || domain;

  const image =
    get([
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ]) || "";

  const author =
    get([
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="twitter:creator"]',
    ]) || "";

  const publishedDate =
    get([
      'meta[property="article:published_time"]',
      'meta[property="og:updated_time"]',
    ]) || $("time").first().attr("datetime") || "";

  // Favicon
  let favicon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="apple-touch-icon"]').attr("href") ||
    "";

  if (favicon && !favicon.startsWith("http")) {
    favicon = new URL(favicon, parsedUrl.origin).href;
  }
  if (!favicon) {
    favicon = `${parsedUrl.origin}/favicon.ico`;
  }

  // Resolve relative image URL
  let resolvedImage = image;
  if (resolvedImage && !resolvedImage.startsWith("http")) {
    resolvedImage = new URL(resolvedImage, parsedUrl.origin).href;
  }

  return {
    title,
    description,
    siteName,
    favicon,
    image: resolvedImage,
    author,
    publishedDate,
    url: resp.url || url,
    domain,
  };
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const meta = await extractMeta(url);
    return NextResponse.json(meta);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch page" },
      { status: 500 }
    );
  }
}
