import { NextRequest, NextResponse } from "next/server";
import { fetchYouTubeInfo } from "@/lib/youtube";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const data = await fetchYouTubeInfo(url);
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message || String(err) : String(err);
    return NextResponse.json(
      { error: message || "Failed to fetch YouTube data" },
      { status: 500 }
    );
  }
}
