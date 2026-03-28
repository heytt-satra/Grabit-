import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ytDlpBinaryPath = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);

const ffmpegBinaryPath = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "ffmpeg-static",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
);

interface RunYtDlpOptions {
  cwd?: string;
  signal?: AbortSignal;
}

export function getYtDlpBinaryPath() {
  return ytDlpBinaryPath;
}

export function getFfmpegBinaryPath() {
  return ffmpegBinaryPath;
}

export function hasYtDlpBinary() {
  return fs.existsSync(ytDlpBinaryPath);
}

export function hasFfmpegBinary() {
  return fs.existsSync(ffmpegBinaryPath);
}

export async function runYtDlp(
  args: string[],
  options: RunYtDlpOptions = {}
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(ytDlpBinaryPath, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const cleanup = () => {
      if (options.signal) {
        options.signal.removeEventListener("abort", abortHandler);
      }
    };

    const settle = (
      action: "resolve" | "reject",
      value: { stdout: string; stderr: string } | Error
    ) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (action === "resolve") {
        resolve(value as { stdout: string; stderr: string });
      } else {
        reject(value);
      }
    };

    const abortHandler = () => {
      child.kill("SIGKILL");
      settle("reject", new Error("The YouTube request was cancelled"));
    };

    if (options.signal) {
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      settle("reject", error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        settle("resolve", { stdout, stderr });
        return;
      }

      settle(
        "reject",
        new Error(stderr.trim() || `yt-dlp exited with code ${String(code)}`)
      );
    });
  });
}
