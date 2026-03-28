import { NextRequest, NextResponse } from "next/server";
import { fetchYouTubeData } from "@/lib/innertube";
import { extractYouTubeId } from "@/lib/platforms";
import { normalizeYouTubeInfo } from "@/lib/youtube";
import type { YtdlCoreVideoInfo } from "@/lib/youtube";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    return NextResponse.json(
      { error: "Invalid YouTube URL" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchYouTubeData(videoId);

    // Map to the format the normalizer expects
    const info: YtdlCoreVideoInfo = {
      videoDetails: {
        videoId: data.id,
        title: data.title,
        description: data.description,
        lengthSeconds: String(data.duration),
        viewCount: data.viewCount,
        author: {
          id: "",
          name: data.author,
          channel_url: data.authorUrl,
        },
        thumbnails: data.thumbnails,
      },
      formats: data.formats.map((f) => ({
        itag: f.itag,
        url: f.url,
        mimeType: f.mimeType,
        bitrate: f.bitrate,
        width: f.width,
        height: f.height,
        fps: f.fps,
        qualityLabel: f.qualityLabel,
        contentLength: f.contentLength,
        hasAudio: f.hasAudio,
        hasVideo: f.hasVideo,
        container: f.container,
      })),
    };

    return NextResponse.json(normalizeYouTubeInfo(info));
  } catch (error) {
    const message =
      error instanceof Error ? error.message || String(error) : String(error);

    const isBlocked = /sign in|bot|playability|login|private|age|restricted/i.test(message);
    const isUnavailable = /unavailable|not found|removed|deleted/i.test(message);

    let userMessage: string;
    if (isBlocked) {
      userMessage = "YouTube blocked this request. The video may be private, age-restricted, or region-locked. Try a different public video.";
    } else if (isUnavailable) {
      userMessage = "This video is unavailable. It may have been removed or made private.";
    } else {
      userMessage = message || "Failed to fetch YouTube data";
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
