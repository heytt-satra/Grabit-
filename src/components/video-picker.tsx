"use client";

import {
  Card,
  Image,
  Text,
  Button,
  Stack,
  Group,
  Badge,
  SegmentedControl,
  Paper,
  Progress,
  Skeleton,
} from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import type { VideoData, VideoVariant } from "@/lib/twitter";
import { getQualityLabel } from "@/lib/twitter";

interface VideoPickerProps {
  video: VideoData | null;
  loading: boolean;
  tweetUrl: string;
}

export function VideoPicker({ video, loading, tweetUrl }: VideoPickerProps) {
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  if (loading) {
    return (
      <Card radius="lg" withBorder p="lg">
        <Stack gap="md">
          <Skeleton height={300} radius="md" />
          <Skeleton height={40} radius="md" />
          <Skeleton height={50} radius="md" />
        </Stack>
      </Card>
    );
  }

  if (!video) return null;

  const sortedVariants = [...video.variants]
    .filter((v) => v.bitrate)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  if (sortedVariants.length === 0) {
    return (
      <Card radius="lg" withBorder p="lg">
        <Text ta="center" c="dimmed">
          No downloadable video found in this tweet.
        </Text>
      </Card>
    );
  }

  const qualityOptions = sortedVariants.map((v) => ({
    label: getQualityLabel(v.bitrate),
    value: v.url,
  }));

  const selected = selectedVariant || sortedVariants[0]?.url || "";

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setProgress(0);

      // Extract username from tweet URL for filename
      const match = tweetUrl.match(/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/);
      const username = match?.[1] || "tweet";
      const tweetId = match?.[2] || "video";
      const filename = `@${username}_${tweetId}.mp4`;

      // Proxy through our API to avoid CORS issues
      const proxyUrl = `/api/download?url=${encodeURIComponent(selected)}&filename=${encodeURIComponent(filename)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength) : 0;

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to read response");

      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) setProgress(Math.round((received / total) * 100));
      }

      const blob = new Blob(chunks as BlobPart[], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notifications.show({
        title: "Download complete",
        message: "Video saved successfully!",
        color: "green",
      });
    } catch {
      notifications.show({
        title: "Download failed",
        message: "Could not download the video. Please try again.",
        color: "red",
      });
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

  return (
    <Card radius="lg" withBorder p="lg">
      <Stack gap="lg">
        {video.thumbnail && (
          <Paper radius="md" style={{ overflow: "hidden", position: "relative" }}>
            <Image
              src={video.thumbnail}
              alt="Video thumbnail"
              radius="md"
              fit="contain"
              h={350}
            />
            {video.duration_ms && (
              <Badge
                style={{ position: "absolute", bottom: 12, right: 12 }}
                variant="filled"
                color="dark"
                size="lg"
              >
                {Math.floor(video.duration_ms / 60000)}:
                {String(Math.floor((video.duration_ms % 60000) / 1000)).padStart(2, "0")}
              </Badge>
            )}
          </Paper>
        )}

        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Select quality
          </Text>
          <SegmentedControl
            fullWidth
            data={qualityOptions}
            value={selected}
            onChange={setSelectedVariant}
            radius="lg"
            size="md"
          />
        </Stack>

        {downloading && progress > 0 && (
          <Progress
            value={progress}
            size="lg"
            radius="xl"
            animated
            color="blue"
          />
        )}

        <Button
          size="lg"
          radius="xl"
          fullWidth
          onClick={handleDownload}
          loading={downloading}
          leftSection={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          }
        >
          {downloading ? `Downloading... ${progress}%` : "Download Video"}
        </Button>

        <Group justify="center">
          <Text size="xs" c="dimmed">
            {sortedVariants.length} quality option{sortedVariants.length > 1 ? "s" : ""} available
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}
