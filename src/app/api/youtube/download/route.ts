import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextRequest, NextResponse } from "next/server";
import { extractYouTubeId } from "@/lib/platforms";
import { fetchYouTubeData } from "@/lib/innertube";
import type { YTFormat } from "@/lib/youtube";
import { buildYouTubeFilename } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 300;

function getFfmpegPath(): string | null {
  try {
    const ffmpegStatic = require("ffmpeg-static") as string;
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {
    // ffmpeg-static not available
  }
  return null;
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "grabit-youtube-"));
}

function cleanupTempDir(tempDir: string) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

async function downloadUrl(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with status ${response.status}`);
  }
  const nodeStream = Readable.fromWeb(response.body as import("stream/web").ReadableStream);
  await pipeline(nodeStream, fs.createWriteStream(filePath));
}

async function muxWithFfmpeg(
  ffmpegPath: string,
  videoPath: string,
  audioPath: string,
  outputPath: string,
  container: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "copy",
      "-movflags", "+faststart",
    ];

    if (container === "mp4") {
      args.push("-f", "mp4");
    }

    args.push(outputPath);

    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function streamFileAsResponse(
  filePath: string,
  filename: string,
  container: string,
  onCleanup: () => void
): NextResponse {
  const fileStream = fs.createReadStream(filePath);
  fileStream.on("close", onCleanup);
  fileStream.on("error", onCleanup);

  return new NextResponse(Readable.toWeb(fileStream) as ReadableStream, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": container === "webm" ? "video/webm" : "video/mp4",
    },
  });
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

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  const isMuxed = muxed === "true";
  const outputContainer = container === "webm" ? "webm" : "mp4";
  const tempDir = createTempDir();

  const selectedFormat: YTFormat = {
    itag: itag || "best",
    url: "",
    quality: quality || "Best",
    qualityLabel: quality || "Best",
    mimeType: `video/${outputContainer}`,
    bitrate: 0,
    hasAudio: isMuxed,
    hasVideo: true,
    container: outputContainer,
    isMuxed,
  };

  try {
    const data = await fetchYouTubeData(videoId);

    // Find the requested format
    const targetItag = itag ? Number(itag) : null;
    const videoFormat = targetItag
      ? data.formats.find((f) => f.itag === targetItag)
      : data.formats[0];

    if (!videoFormat) {
      cleanupTempDir(tempDir);
      return NextResponse.json(
        { error: "Requested format not found" },
        { status: 404 }
      );
    }

    const filename = buildYouTubeFilename(
      title || data.title || "YouTube video",
      { ...selectedFormat, container: outputContainer }
    );

    // Muxed format: download directly
    if (videoFormat.isMuxed) {
      const videoPath = path.join(tempDir, `download.${outputContainer}`);
      await downloadUrl(videoFormat.url, videoPath);
      return streamFileAsResponse(videoPath, filename, outputContainer, () =>
        cleanupTempDir(tempDir)
      );
    }

    // Non-muxed: try to merge with ffmpeg
    const ffmpegPath = getFfmpegPath();
    const audioUrl = data.bestAudioUrl;

    if (!ffmpegPath || !audioUrl) {
      // No ffmpeg or no audio — download video-only
      const videoPath = path.join(tempDir, `download.${outputContainer}`);
      await downloadUrl(videoFormat.url, videoPath);
      return streamFileAsResponse(videoPath, filename, outputContainer, () =>
        cleanupTempDir(tempDir)
      );
    }

    // Download video + audio in parallel, then merge
    const videoPath = path.join(tempDir, `video.${outputContainer}`);
    const audioExt = outputContainer === "webm" ? "webm" : "m4a";
    const audioPath = path.join(tempDir, `audio.${audioExt}`);
    const outputPath = path.join(tempDir, `merged.${outputContainer}`);

    await Promise.all([
      downloadUrl(videoFormat.url, videoPath),
      downloadUrl(audioUrl, audioPath),
    ]);

    await muxWithFfmpeg(
      ffmpegPath,
      videoPath,
      audioPath,
      outputPath,
      outputContainer
    );

    const finalContainer =
      path.extname(outputPath).replace(/^\./, "") || outputContainer;

    return streamFileAsResponse(
      outputPath,
      buildYouTubeFilename(title || data.title || "YouTube video", {
        ...selectedFormat,
        container: finalContainer,
      }),
      finalContainer,
      () => cleanupTempDir(tempDir)
    );
  } catch (error) {
    cleanupTempDir(tempDir);
    const message =
      error instanceof Error ? error.message || String(error) : String(error);

    return NextResponse.json(
      {
        error:
          /sign in|bot|playability|login|private|age/i.test(message)
            ? "YouTube blocked this request while preparing the download. Try again in a moment with a public video."
            : message || "Failed to prepare the YouTube download",
      },
      { status: 500 }
    );
  }
}
