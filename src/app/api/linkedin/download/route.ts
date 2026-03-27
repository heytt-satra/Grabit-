import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import youtubedl from "youtube-dl-exec";
import { normalizeLinkedInUrl } from "@/lib/platforms";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const normalizedUrl = normalizeLinkedInUrl(url);
  if (!normalizedUrl) {
    return NextResponse.json({ error: "Invalid LinkedIn URL" }, { status: 400 });
  }

  try {
    const downloadProcess = youtubedl.exec(
      normalizedUrl,
      {
        format: "best[ext=mp4]/best",
        output: "-",
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
      },
      {
        windowsHide: true,
      }
    );

    request.signal.addEventListener("abort", () => {
      downloadProcess.kill();
    });

    if (!downloadProcess.stdout) {
      throw new Error("LinkedIn download stream did not start");
    }

    const headers = new Headers({
      "Content-Type": "video/mp4",
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
      { error: message || "Failed to download LinkedIn video" },
      { status: 500 }
    );
  }
}
