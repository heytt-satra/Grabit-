import { NextRequest, NextResponse } from "next/server";
import { extractTweetId, fetchTweetData } from "@/lib/twitter";

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
    const tweet = await fetchTweetData(tweetId);
    return NextResponse.json(tweet);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch tweet. It may be deleted or from a private account." },
      { status: 404 }
    );
  }
}
