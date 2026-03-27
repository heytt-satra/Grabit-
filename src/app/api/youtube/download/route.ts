import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import {
  buildYouTubeFilename,
  fetchYouTubeInfo,
  getYouTubeDownloadStream,
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
    const format =
      info.formats.find((candidate) => candidate.itag === itag) ||
      info.formats[0];

    if (!format) {
      return NextResponse.json(
        { error: "No downloadable format found for this video" },
        { status: 404 }
      );
    }

    const stream = getYouTubeDownloadStream(url, Number(format.itag));

    request.signal.addEventListener("abort", () => {
      if ("destroy" in stream && typeof stream.destroy === "function") {
        stream.destroy();
      }
    });

    const headers = new Headers({
      "Content-Type":
        format.container === "webm" ? "video/webm" : "video/mp4",
      "Content-Disposition": `attachment; filename="${buildYouTubeFilename(
        info.title,
        format
      )}"`,
      "Cache-Control": "no-store",
    });

    if (format.contentLength) {
      headers.set("Content-Length", format.contentLength);
    }

    return new NextResponse(
      Readable.toWeb(Readable.from(stream)) as ReadableStream,
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
