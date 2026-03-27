import { NextRequest, NextResponse } from "next/server";
import { extractTweetId, fetchVideoData } from "@/lib/twitter";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const tweetId = extractTweetId(url);
  if (!tweetId) {
    return NextResponse.json({ error: "Invalid tweet URL" }, { status: 400 });
  }

  try {
    const video = await fetchVideoData(tweetId);
    if (!video) {
      return NextResponse.json(
        { error: "No video found in this tweet" },
        { status: 404 }
      );
    }
    return NextResponse.json(video);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch video data" },
      { status: 500 }
    );
  }
}
