"use client";

import {
  Paper,
  Stack,
  Group,
  Button,
  SegmentedControl,
  Text,
  Box,
  Image,
  Divider,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { RegionSelector, type CropRect } from "./region-selector";

const MotionDiv = motion.div;

type Phase = "idle" | "cropping" | "done";
type Resolution = "1080p" | "4k";
type CaptureMode = "fullscreen" | "region";
type ExportFormat = "png" | "jpg";

const RESOLUTIONS: Record<Resolution, { w: number; h: number; label: string }> = {
  "1080p": { w: 1920, h: 1080, label: "1080p (1920x1080)" },
  "4k": { w: 3840, h: 2160, label: "4K (3840x2160)" },
};

export function ScreenCapture() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [mode, setMode] = useState<CaptureMode>("region");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [outputImage, setOutputImage] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const captureScreen = useCallback(async () => {
    // Check API support
    if (!navigator.mediaDevices?.getDisplayMedia) {
      notifications.show({
        title: "Not supported",
        message: "Screen capture is not supported in this browser. Try Chrome or Edge.",
        color: "red",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 3840 }, height: { ideal: 2160 } },
      });

      const track = stream.getVideoTracks()[0];

      // Create a video element to grab a frame
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;

      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve);
        };
      });

      // Wait a frame for the video to render
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Grab the frame
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context failed");
      ctx.drawImage(video, 0, 0);

      // Stop the stream immediately
      track.stop();
      video.srcObject = null;

      const dataUrl = canvas.toDataURL("image/png");
      setCapturedImage(dataUrl);
      setSourceSize({ w: video.videoWidth, h: video.videoHeight });

      if (mode === "fullscreen") {
        // Process directly at target resolution
        processFullscreen(canvas, video.videoWidth, video.videoHeight);
      } else {
        // Go to cropping phase
        setPhase("cropping");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        notifications.show({
          title: "Cancelled",
          message: "Screen capture was cancelled.",
          color: "yellow",
        });
      } else {
        notifications.show({
          title: "Capture failed",
          message: err instanceof Error ? err.message : "Unknown error",
          color: "red",
        });
      }
    }
  }, [mode, resolution]);

  const processFullscreen = useCallback(
    (sourceCanvas: HTMLCanvasElement, srcW: number, srcH: number) => {
      const target = RESOLUTIONS[resolution];
      const outputCanvas = document.createElement("canvas");

      // Maintain source aspect ratio, fit within target resolution
      const srcAspect = srcW / srcH;
      const targetAspect = target.w / target.h;

      let outW: number, outH: number;
      if (srcAspect > targetAspect) {
        outW = target.w;
        outH = Math.round(target.w / srcAspect);
      } else {
        outH = target.h;
        outW = Math.round(target.h * srcAspect);
      }

      outputCanvas.width = outW;
      outputCanvas.height = outH;

      const ctx = outputCanvas.getContext("2d");
      if (!ctx) return;

      // Use high-quality scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceCanvas, 0, 0, outW, outH);

      outputCanvasRef.current = outputCanvas;
      setOutputImage(outputCanvas.toDataURL("image/png"));
      setOutputSize({ w: outW, h: outH });
      setPhase("done");
    },
    [resolution]
  );

  const handleRegionSelect = useCallback(
    (rect: CropRect) => {
      if (!capturedImage) return;

      const img = new window.Image();
      img.onload = () => {
        const target = RESOLUTIONS[resolution];
        const outputCanvas = document.createElement("canvas");

        // Scale the cropped region to fit within target resolution
        const cropAspect = rect.w / rect.h;
        const targetAspect = target.w / target.h;

        let outW: number, outH: number;
        if (cropAspect > targetAspect) {
          outW = Math.min(target.w, rect.w);
          outH = Math.round(outW / cropAspect);
        } else {
          outH = Math.min(target.h, rect.h);
          outW = Math.round(outH * cropAspect);
        }

        // If source is smaller than target, scale up to target
        if (outW < target.w && outH < target.h) {
          if (cropAspect > targetAspect) {
            outW = target.w;
            outH = Math.round(target.w / cropAspect);
          } else {
            outH = target.h;
            outW = Math.round(target.h * cropAspect);
          }
        }

        outputCanvas.width = outW;
        outputCanvas.height = outH;

        const ctx = outputCanvas.getContext("2d");
        if (!ctx) return;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(
          img,
          rect.x, rect.y, rect.w, rect.h,
          0, 0, outW, outH
        );

        outputCanvasRef.current = outputCanvas;
        setOutputImage(outputCanvas.toDataURL("image/png"));
        setOutputSize({ w: outW, h: outH });
        setPhase("done");
      };
      img.src = capturedImage;
    },
    [capturedImage, resolution]
  );

  const handleExport = useCallback(() => {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;

    const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `snip-${outputSize.w}x${outputSize.h}-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        notifications.show({
          title: "Saved!",
          message: `Screenshot saved as ${format.toUpperCase()} (${outputSize.w}x${outputSize.h})`,
          color: "green",
        });
      },
      mimeType,
      0.95
    );
  }, [format, outputSize]);

  const handleCopy = useCallback(async () => {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed"))), "image/png")
      );
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      notifications.show({
        title: "Copied!",
        message: "Screenshot copied to clipboard",
        color: "green",
      });
    } catch {
      notifications.show({
        title: "Copy failed",
        message: "Could not copy to clipboard",
        color: "red",
      });
    }
  }, []);

  const resetCapture = () => {
    setPhase("idle");
    setCapturedImage(null);
    setOutputImage(null);
    setOutputSize({ w: 0, h: 0 });
    outputCanvasRef.current = null;
  };

  return (
    <Paper radius="lg" withBorder p="xl">
      {/* ===== IDLE PHASE ===== */}
      {phase === "idle" && (
        <MotionDiv
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Stack align="center" gap="xl" py="xl">
            {/* Icon */}
            <Box
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "var(--mantine-color-blue-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--mantine-color-blue-6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" />
                <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
              </svg>
            </Box>

            <Stack align="center" gap={4}>
              <Text size="xl" fw={700}>Screen Snip</Text>
              <Text size="sm" c="dimmed">
                Capture your screen or select a region at high resolution
              </Text>
            </Stack>

            {/* Controls */}
            <Stack gap="md" w="100%" maw={420}>
              <div>
                <Text size="sm" fw={600} mb={6}>Capture Mode</Text>
                <SegmentedControl
                  fullWidth
                  radius="lg"
                  data={[
                    { label: "Select Region", value: "region" },
                    { label: "Full Screen", value: "fullscreen" },
                  ]}
                  value={mode}
                  onChange={(v) => setMode(v as CaptureMode)}
                />
              </div>

              <div>
                <Text size="sm" fw={600} mb={6}>Output Resolution</Text>
                <SegmentedControl
                  fullWidth
                  radius="lg"
                  data={[
                    { label: "1080p", value: "1080p" },
                    { label: "4K", value: "4k" },
                  ]}
                  value={resolution}
                  onChange={(v) => setResolution(v as Resolution)}
                />
              </div>

              <div>
                <Text size="sm" fw={600} mb={6}>Format</Text>
                <SegmentedControl
                  fullWidth
                  radius="lg"
                  data={[
                    { label: "PNG", value: "png" },
                    { label: "JPG", value: "jpg" },
                  ]}
                  value={format}
                  onChange={(v) => setFormat(v as ExportFormat)}
                />
              </div>
            </Stack>

            <Button
              size="xl"
              radius="xl"
              px={48}
              onClick={captureScreen}
              leftSection={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" />
                  <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
                </svg>
              }
            >
              Capture Screen
            </Button>

            <Text size="xs" c="dimmed">
              Your browser will ask you to choose a screen, window, or tab to capture
            </Text>
          </Stack>
        </MotionDiv>
      )}

      {/* ===== CROPPING PHASE ===== */}
      {phase === "cropping" && capturedImage && (
        <MotionDiv
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <RegionSelector
            imageSrc={capturedImage}
            sourceWidth={sourceSize.w}
            sourceHeight={sourceSize.h}
            onSelect={handleRegionSelect}
            onCancel={resetCapture}
          />
        </MotionDiv>
      )}

      {/* ===== DONE PHASE ===== */}
      {phase === "done" && outputImage && (
        <MotionDiv
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Stack gap="lg">
            {/* Preview */}
            <Paper
              radius="md"
              style={{
                overflow: "hidden",
                background:
                  "repeating-conic-gradient(#80808015 0% 25%, transparent 0% 50%) 50% / 20px 20px",
              }}
            >
              <Image
                src={outputImage}
                alt="Captured screenshot"
                fit="contain"
                h={400}
                style={{ imageRendering: "auto" }}
              />
            </Paper>

            {/* Info */}
            <Group justify="center" gap="lg">
              <Group gap={4}>
                <Text size="sm" c="dimmed">Resolution:</Text>
                <Text size="sm" fw={600}>{outputSize.w} x {outputSize.h}</Text>
              </Group>
              <Group gap={4}>
                <Text size="sm" c="dimmed">Target:</Text>
                <Text size="sm" fw={600}>{RESOLUTIONS[resolution].label}</Text>
              </Group>
            </Group>

            <Divider />

            {/* Export buttons */}
            <Group grow>
              <Button size="lg" radius="xl" onClick={handleExport}>
                Save {format.toUpperCase()}
              </Button>
              <Button size="lg" radius="xl" variant="light" onClick={handleCopy}>
                Copy to Clipboard
              </Button>
            </Group>

            <Button
              radius="xl"
              variant="subtle"
              color="gray"
              onClick={resetCapture}
              fullWidth
            >
              Capture Again
            </Button>
          </Stack>
        </MotionDiv>
      )}
    </Paper>
  );
}
