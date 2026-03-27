import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("id");
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
  }

  const thumbnails = [
    { quality: "Max Resolution (1920x1080)", url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, width: 1920, height: 1080 },
    { quality: "Standard (640x480)", url: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`, width: 640, height: 480 },
    { quality: "High (480x360)", url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, width: 480, height: 360 },
    { quality: "Medium (320x180)", url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`, width: 320, height: 180 },
  ];

  // Verify which thumbnails actually exist
  const verified = await Promise.all(
    thumbnails.map(async (t) => {
      try {
        const resp = await fetch(t.url, { method: "HEAD" });
        return { ...t, exists: resp.ok && resp.headers.get("content-type")?.includes("image") };
      } catch {
        return { ...t, exists: false };
      }
    })
  );

  return NextResponse.json(verified.filter((t) => t.exists));
}
