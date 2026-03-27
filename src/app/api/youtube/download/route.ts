import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import ffmpegPath from "ffmpeg-static";
import youtubedl from "youtube-dl-exec";
import {
  buildYouTubeDownloadSelector,
  buildYouTubeFilename,
  fetchYouTubeInfo,
} from "@/lib/youtube";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const itag = request.nextUrl.searchParams.get("itag");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const info = await fetchYouTubeInfo(url);
    const format = info.formats.find((candidate) => candidate.itag === itag) || info.formats[0];

    if (!format) {
      return NextResponse.json(
        { error: "No downloadable format found for this video" },
        { status: 404 }
      );
    }

    if (!format.isMuxed && !ffmpegPath) {
      return NextResponse.json(
        { error: "FFmpeg is required to merge the selected YouTube format" },
        { status: 500 }
      );
    }

    const downloadProcess = youtubedl.exec(
      url,
      {
        format: buildYouTubeDownloadSelector(format),
        output: "-",
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
        mergeOutputFormat: format.container || "mp4",
        ffmpegLocation: ffmpegPath || undefined,
      },
      {
        windowsHide: true,
      }
    );

    request.signal.addEventListener("abort", () => {
      downloadProcess.kill();
    });

    if (!downloadProcess.stdout) {
      throw new Error("YouTube download stream did not start");
    }

    const headers = new Headers({
      "Content-Type":
        format.container === "webm" ? "video/webm" : "video/mp4",
      "Content-Disposition": `attachment; filename="${buildYouTubeFilename(
        info.title,
        format
      )}"`,
      "Cache-Control": "no-store",
    });

    return new NextResponse(
      Readable.toWeb(downloadProcess.stdout) as ReadableStream,
      {
        status: 200,
        headers,
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message || String(err) : String(err);
    return NextResponse.json(
      {
        error: message || "Failed to download YouTube video",
      },
      { status: 500 }
    );
  }
}
