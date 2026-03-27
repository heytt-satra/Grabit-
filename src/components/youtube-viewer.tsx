"use client";

import {
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Image,
  Paper,
  Select,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";

interface YTFormat {
  itag: string;
  quality: string;
  qualityLabel: string;
  mimeType: string;
  bitrate: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  hasVideo: boolean;
  contentLength?: string;
  container: string;
  isMuxed: boolean;
}

interface YTThumbnail {
  quality: string;
  url: string;
  width: number;
  height: number;
}

interface YTVideoInfo {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  duration: string;
  viewCount: string;
  formats: YTFormat[];
  thumbnails: YTThumbnail[];
}

interface Props {
  data: YTVideoInfo | null;
  loading: boolean;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatViews(value: string): string {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return value;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M views`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K views`;
  return `${count} views`;
}

function describeFormat(format: YTFormat): string {
  const parts = [`${format.qualityLabel}`, format.container.toUpperCase()];

  if (format.contentLength) {
    parts.push(formatBytes(Number(format.contentLength)));
  }

  if (!format.isMuxed) {
    parts.push("merged with best audio");
  }

  return parts.join(" • ");
}

export function YouTubeViewer({ data, loading }: Props) {
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("video");

  const formatOptions = useMemo(
    () =>
      (data?.formats || []).map((format) => ({
        value: format.itag,
        label: describeFormat(format),
      })),
    [data]
  );

  if (loading) {
    return (
      <Card radius="lg" withBorder p="lg">
        <Stack gap="md">
          <Skeleton h={300} radius="md" />
          <Skeleton h={20} w="70%" />
          <Skeleton h={50} radius="md" />
        </Stack>
      </Card>
    );
  }

  if (!data) return null;

  const currentFormat =
    data.formats.find((format) => format.itag === selectedFormat) || data.formats[0];

  const startDownload = (downloadUrl: string, filenameHint: string) => {
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filenameHint;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleVideoDownload = async () => {
    if (!currentFormat) return;

    setDownloading(true);

    try {
      const downloadUrl = `/api/youtube/download?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${data.id}`
      )}&itag=${encodeURIComponent(currentFormat.itag)}`;

      startDownload(downloadUrl, `${data.title}_${currentFormat.qualityLabel}.${currentFormat.container}`);

      notifications.show({
        title: "Download started",
        message: currentFormat.isMuxed
          ? `${currentFormat.qualityLabel} is downloading now`
          : `${currentFormat.qualityLabel} will be merged with the best audio before download`,
        color: "green",
      });
    } catch {
      notifications.show({
        title: "Download failed",
        message: "Please try again",
        color: "red",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleThumbnailDownload = (thumb: YTThumbnail) => {
    startDownload(
      `/api/download?url=${encodeURIComponent(thumb.url)}&filename=${encodeURIComponent(
        `${data.id}_thumbnail_${thumb.width}x${thumb.height}.jpg`
      )}`,
      `${data.id}_thumbnail_${thumb.width}x${thumb.height}.jpg`
    );
  };

  return (
    <Card radius="lg" withBorder p="lg">
      <Stack gap="lg">
        <Paper radius="md" style={{ overflow: "hidden", position: "relative" }}>
          <Image src={data.thumbnail} alt={data.title} radius="md" fit="cover" h={300} />
          {data.duration && (
            <Badge
              style={{ position: "absolute", bottom: 12, right: 12 }}
              variant="filled"
              color="dark"
              size="lg"
            >
              {data.duration}
            </Badge>
          )}
        </Paper>

        <div>
          <Text fw={700} size="lg" lineClamp={2}>
            {data.title}
          </Text>
          <Group gap="sm" mt={4}>
            <Text size="sm" c="dimmed">
              {data.author}
            </Text>
            {data.viewCount && (
              <>
                <Text size="sm" c="dimmed">
                  ·
                </Text>
                <Text size="sm" c="dimmed">
                  {formatViews(data.viewCount)}
                </Text>
              </>
            )}
          </Group>
        </div>

        <Tabs value={activeTab} onChange={setActiveTab} radius="lg" variant="pills">
          <Tabs.List>
            <Tabs.Tab value="video">Download Video</Tabs.Tab>
            <Tabs.Tab value="thumbnails">Thumbnails</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="video" pt="lg">
            <Stack gap="md">
              {data.formats.length > 0 ? (
                <>
                  <Text size="sm" fw={600}>
                    Select quality
                  </Text>
                  <Select
                    value={currentFormat?.itag || null}
                    onChange={setSelectedFormat}
                    data={formatOptions}
                    placeholder="Choose the quality you want"
                    radius="lg"
                    searchable={false}
                  />

                  {currentFormat && (
                    <Group gap="xs">
                      <Badge variant="light" radius="lg" color="red">
                        {currentFormat.qualityLabel}
                      </Badge>
                      <Badge variant="light" radius="lg" color="gray">
                        {currentFormat.container.toUpperCase()}
                      </Badge>
                      {!currentFormat.isMuxed && (
                        <Badge variant="light" radius="lg" color="blue">
                          Best audio merged automatically
                        </Badge>
                      )}
                    </Group>
                  )}

                  <Button
                    size="lg"
                    radius="xl"
                    fullWidth
                    onClick={handleVideoDownload}
                    loading={downloading}
                    leftSection={
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    }
                  >
                    Download {currentFormat?.qualityLabel || "Video"}
                  </Button>
                </>
              ) : (
                <Paper p="xl" radius="lg" ta="center" bg="var(--mantine-color-dark-6)">
                  <Text c="dimmed">
                    No downloadable YouTube formats were returned for this video.
                  </Text>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="thumbnails" pt="lg">
            <Grid gutter="md">
              {data.thumbnails.map((thumb) => (
                <Grid.Col span={{ base: 12, sm: 6 }} key={`${thumb.url}-${thumb.width}`}>
                  <Card radius="md" withBorder p="xs">
                    <Image src={thumb.url} alt={thumb.quality} radius="sm" h={140} fit="cover" />
                    <Group justify="space-between" mt="xs" px="xs">
                      <div>
                        <Text size="xs" fw={600}>
                          {thumb.quality}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {thumb.width}x{thumb.height}
                        </Text>
                      </div>
                      <Button
                        size="xs"
                        radius="xl"
                        variant="light"
                        onClick={() => handleThumbnailDownload(thumb)}
                      >
                        Save
                      </Button>
                    </Group>
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Card>
  );
}
