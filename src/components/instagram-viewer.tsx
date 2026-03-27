"use client";

import {
  Card,
  Image,
  Text,
  Button,
  Stack,
  Group,
  Badge,
  Paper,
  Skeleton,
  ActionIcon,
} from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import JSZip from "jszip";

interface InstaMedia {
  type: "image" | "video";
  url: string;
  thumbnail?: string;
}

interface InstaPostData {
  shortcode: string;
  caption: string;
  author: string;
  isCarousel: boolean;
  media: InstaMedia[];
  likeCount: number;
  commentCount: number;
}

interface Props {
  data: InstaPostData | null;
  loading: boolean;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export function InstagramViewer({ data, loading }: Props) {
  const [downloading, setDownloading] = useState<number | "all" | null>(null);

  if (loading) {
    return (
      <Card radius="lg" withBorder p="lg">
        <Stack gap="md">
          <Skeleton h={400} radius="md" />
          <Skeleton h={20} w="60%" />
          <Skeleton h={50} radius="md" />
        </Stack>
      </Card>
    );
  }

  if (!data || data.media.length === 0) return null;

  const downloadSingle = async (media: InstaMedia, index: number) => {
    setDownloading(index);
    try {
      const ext = media.type === "video" ? "mp4" : "jpg";
      const filename = `${data.author || "instagram"}_${data.shortcode}_${index + 1}.${ext}`;
      const proxyUrl = `/api/download?url=${encodeURIComponent(media.url)}&filename=${encodeURIComponent(filename)}`;

      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error("Download failed");

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notifications.show({ title: "Downloaded!", message: filename, color: "green" });
    } catch {
      notifications.show({ title: "Download failed", message: "Please try again", color: "red" });
    } finally {
      setDownloading(null);
    }
  };

  const downloadAll = async () => {
    setDownloading("all");
    try {
      const zip = new JSZip();

      for (let i = 0; i < data.media.length; i++) {
        const media = data.media[i];
        const ext = media.type === "video" ? "mp4" : "jpg";
        const filename = `${data.author || "instagram"}_${data.shortcode}_${i + 1}.${ext}`;
        const proxyUrl = `/api/download?url=${encodeURIComponent(media.url)}&filename=${encodeURIComponent(filename)}`;

        const resp = await fetch(proxyUrl);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        zip.file(filename, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.author || "instagram"}_${data.shortcode}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notifications.show({ title: "Downloaded!", message: "All slides saved as ZIP", color: "green" });
    } catch {
      notifications.show({ title: "Download failed", message: "Could not create ZIP", color: "red" });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card radius="lg" withBorder p="lg">
      <Stack gap="lg">
        {/* Author + Stats */}
        <Group justify="space-between">
          <Group gap="sm">
            <Badge size="lg" variant="light" color="pink" radius="lg">
              @{data.author || "instagram"}
            </Badge>
            {data.isCarousel && (
              <Badge variant="light" color="gray" radius="lg">
                {data.media.length} slides
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            {data.likeCount > 0 && (
              <Text size="sm" c="dimmed">{formatCount(data.likeCount)} likes</Text>
            )}
            {data.commentCount > 0 && (
              <Text size="sm" c="dimmed">{formatCount(data.commentCount)} comments</Text>
            )}
          </Group>
        </Group>

        {/* Media */}
        {data.media.length === 1 ? (
          <Paper radius="md" style={{ overflow: "hidden" }}>
            {data.media[0].type === "video" ? (
              <video
                src={`/api/download?url=${encodeURIComponent(data.media[0].url)}&filename=preview.mp4`}
                controls
                style={{ width: "100%", maxHeight: 500, background: "#000" }}
                poster={data.media[0].thumbnail}
              />
            ) : (
              <Image
                src={`/api/download?url=${encodeURIComponent(data.media[0].url)}&filename=preview.jpg`}
                alt="Instagram post"
                radius="md"
                fit="contain"
                h={450}
              />
            )}
          </Paper>
        ) : (
          <Carousel
            withIndicators
            withControls
            styles={{
              control: { backgroundColor: "var(--mantine-color-dark-6)", border: "none", color: "#fff" },
            }}
          >
            {data.media.map((media, i) => (
              <Carousel.Slide key={i}>
                <Paper radius="md" style={{ overflow: "hidden", position: "relative" }}>
                  {media.type === "video" ? (
                    <video
                      src={`/api/download?url=${encodeURIComponent(media.url)}&filename=preview.mp4`}
                      controls
                      style={{ width: "100%", height: 450, objectFit: "contain", background: "#000" }}
                      poster={media.thumbnail}
                    />
                  ) : (
                    <Image
                      src={`/api/download?url=${encodeURIComponent(media.url)}&filename=preview.jpg`}
                      alt={`Slide ${i + 1}`}
                      fit="contain"
                      h={450}
                    />
                  )}
                  <Group style={{ position: "absolute", top: 12, right: 12 }} gap="xs">
                    <Badge variant="filled" color="dark">{i + 1}/{data.media.length}</Badge>
                    <ActionIcon
                      variant="filled"
                      color="blue"
                      size="lg"
                      radius="xl"
                      loading={downloading === i}
                      onClick={() => downloadSingle(media, i)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </ActionIcon>
                  </Group>
                </Paper>
              </Carousel.Slide>
            ))}
          </Carousel>
        )}

        {/* Caption */}
        {data.caption && (
          <Text size="sm" lineClamp={4} style={{ whiteSpace: "pre-wrap" }}>
            {data.caption}
          </Text>
        )}

        {/* Download buttons */}
        <Group grow>
          <Button
            size="lg"
            radius="xl"
            onClick={() => downloadSingle(data.media[0], 0)}
            loading={downloading === 0}
            leftSection={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            }
          >
            {data.media.length === 1 ? "Download" : "Download First"}
          </Button>
          {data.media.length > 1 && (
            <Button
              size="lg"
              radius="xl"
              variant="light"
              onClick={downloadAll}
              loading={downloading === "all"}
            >
              Download All (ZIP)
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
