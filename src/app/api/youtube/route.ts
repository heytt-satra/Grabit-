import { NextRequest, NextResponse } from "next/server";
import { normalizeYouTubeInfo } from "@/lib/youtube";
import { hasYtDlpBinary, runYtDlp } from "@/lib/yt-dlp";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  if (!hasYtDlpBinary()) {
    return NextResponse.json(
      { error: "yt-dlp binary is missing on the server" },
      { status: 500 }
    );
  }

  try {
    const { stdout } = await runYtDlp(
      [url, "--dump-single-json", "--no-warnings", "--skip-download", "--no-playlist"],
      { signal: request.signal }
    );

    return NextResponse.json(normalizeYouTubeInfo(JSON.parse(stdout)));
  } catch (error) {
    const message =
      error instanceof Error ? error.message || String(error) : String(error);

    return NextResponse.json(
      {
        error:
          /sign in|bot|playability/i.test(message)
            ? "YouTube blocked this request while resolving the video formats. Try again in a moment with a public video."
            : message || "Failed to fetch YouTube data",
      },
      { status: 500 }
    );
  }
}
