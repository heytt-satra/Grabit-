import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import type { YTFormat } from "@/lib/youtube";
import { buildYouTubeFilename } from "@/lib/youtube";
import {
  getFfmpegBinaryPath,
  hasFfmpegBinary,
  hasYtDlpBinary,
  runYtDlp,
} from "@/lib/yt-dlp";

export const runtime = "nodejs";
export const maxDuration = 300;

const ffmpegPath = getFfmpegBinaryPath();

function createTempDownloadDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "grabit-youtube-"));
}

function cleanupTempDir(tempDir: string) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function buildFormatSelector(format: YTFormat) {
  if (format.isMuxed) {
    return format.itag;
  }

  if (format.container === "webm") {
    return `${format.itag}+bestaudio[ext=webm]/${format.itag}+bestaudio`;
  }

  return `${format.itag}+bestaudio[ext=m4a]/${format.itag}+bestaudio`;
}

function findCompletedDownload(tempDir: string, printedOutput: string) {
  const printedCandidate = printedOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
    .find((line) => fs.existsSync(line));

  if (printedCandidate) {
    return printedCandidate;
  }

  const files = fs
    .readdirSync(tempDir)
    .filter((entry) => !entry.endsWith(".part"))
    .map((entry) => path.join(tempDir, entry))
    .filter((entry) => fs.statSync(entry).isFile());

  return files[0] || null;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const itag = request.nextUrl.searchParams.get("itag");
  const quality = request.nextUrl.searchParams.get("quality");
  const container = request.nextUrl.searchParams.get("container");
  const title = request.nextUrl.searchParams.get("title");
  const muxed = request.nextUrl.searchParams.get("muxed");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  if (!hasYtDlpBinary()) {
    return NextResponse.json(
      { error: "yt-dlp binary is missing on the server" },
      { status: 500 }
    );
  }

  if (!hasFfmpegBinary()) {
    return NextResponse.json(
      { error: "FFmpeg binary is missing on the server" },
      { status: 500 }
    );
  }

  const selectedFormat: YTFormat = {
    itag: itag || "best",
    url: "",
    quality: quality || "Best",
    qualityLabel: quality || "Best",
    mimeType: `video/${container || "mp4"}`,
    bitrate: 0,
    hasAudio: muxed === "true",
    hasVideo: true,
    container: container || "mp4",
    isMuxed: muxed === "true",
  };
  const outputContainer =
    selectedFormat.container === "webm" ? "webm" : "mp4";
  const tempDir = createTempDownloadDir();
  const outputTemplate = path.join(tempDir, "download.%(ext)s");

  try {
    const args = [
      url,
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--force-overwrites",
      "--output",
      outputTemplate,
      "--print",
      "after_move:filepath",
      "--ffmpeg-location",
      ffmpegPath,
      "--format",
      buildFormatSelector(selectedFormat),
    ];

    if (!selectedFormat.isMuxed) {
      args.push("--merge-output-format", outputContainer);
    }

    const { stdout } = await runYtDlp(args, { signal: request.signal });
    const downloadedFile = findCompletedDownload(tempDir, stdout);

    if (!downloadedFile) {
      cleanupTempDir(tempDir);
      return NextResponse.json(
        { error: "yt-dlp did not produce a downloadable file" },
        { status: 500 }
      );
    }

    const finalContainer =
      path.extname(downloadedFile).replace(/^\./, "") || outputContainer;
    const filename = buildYouTubeFilename(title || "YouTube video", {
      ...selectedFormat,
      container: finalContainer,
    });
    const fileStream = fs.createReadStream(downloadedFile);
    const cleanup = () => cleanupTempDir(tempDir);

    fileStream.on("close", cleanup);
    fileStream.on("error", cleanup);

    return new NextResponse(Readable.toWeb(fileStream) as ReadableStream, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type":
          finalContainer === "webm" ? "video/webm" : "video/mp4",
      },
    });
  } catch (error) {
    cleanupTempDir(tempDir);

    const message =
      error instanceof Error ? error.message || String(error) : String(error);

    return NextResponse.json(
      {
        error:
          /sign in|bot|playability/i.test(message)
            ? "YouTube blocked this request while preparing the download. Try again in a moment with a public video."
            : message || "Failed to prepare the YouTube download",
      },
      { status: 500 }
    );
  }
}
