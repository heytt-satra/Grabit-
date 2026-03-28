import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const videoUrl = request.nextUrl.searchParams.get("url");
  const filename = request.nextUrl.searchParams.get("filename") || "video.mp4";

  if (!videoUrl) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Allow downloading from known media CDNs
  const allowed = [
    // Twitter
    "video.twimg.com",
    "pbs.twimg.com",
    "abs.twimg.com",
    // Instagram
    "scontent.cdninstagram.com",
    "instagram.com",
    "cdninstagram.com",
    "fbcdn.net",
  ];
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(videoUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!allowed.some((host) => parsedUrl.hostname.endsWith(host))) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    // Set appropriate Referer for each platform
    let referer = parsedUrl.origin + "/";
    if (parsedUrl.hostname.includes("twimg")) referer = "https://x.com/";
    else if (parsedUrl.hostname.includes("instagram") || parsedUrl.hostname.includes("fbcdn")) referer = "https://www.instagram.com/";

    const resp = await fetch(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: referer,
      },
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Failed to fetch video: ${resp.status}` },
        { status: resp.status }
      );
    }

    const contentType = resp.headers.get("content-type") || "video/mp4";
    const contentLength = resp.headers.get("content-length");

    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new NextResponse(resp.body, { status: 200, headers });
  } catch {
    return NextResponse.json(
      { error: "Failed to download video" },
      { status: 500 }
    );
  }
}
