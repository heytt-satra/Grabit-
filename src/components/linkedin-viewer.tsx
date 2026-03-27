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
} from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import JSZip from "jszip";

interface LinkedInPostData {
  title: string;
  description: string;
  author: string;
  image: string;
  videoUrl: string | null;
  videoQuality: string;
  documentImages: string[];
  documentPdfUrl: string | null;
  documentPageCount: number;
  type: "video" | "image" | "document" | "text";
}

interface Props {
  data: LinkedInPostData | null;
  loading: boolean;
  postUrl?: string;
}

export function LinkedInViewer({ data, loading, postUrl }: Props) {
  const [downloading, setDownloading] = useState(false);
  const authorSlug = (data?.author || "linkedin").replace(/\s+/g, "_");

  if (loading) {
    return (
      <Card radius="lg" withBorder p="lg">
        <Stack gap="md">
          <Skeleton h={300} radius="md" />
          <Skeleton h={20} w="60%" />
          <Skeleton h={50} radius="md" />
        </Stack>
      </Card>
    );
  }

  if (!data) return null;

  const handleDownload = async (url: string, filename: string) => {
    setDownloading(true);
    try {
      const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error("Download failed");

      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      notifications.show({ title: "Downloaded!", message: filename, color: "green" });
    } catch {
      notifications.show({ title: "Download failed", message: "Please try again", color: "red" });
    } finally {
      setDownloading(false);
    }
  };

  const handleDocumentDownload = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();

      for (let i = 0; i < data.documentImages.length; i += 1) {
        const imageUrl = data.documentImages[i];
        const filename = `linkedin_${(data.author || "post").replace(/\s+/g, "_")}_${i + 1}.jpg`;
        const proxyUrl = `/api/download?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(filename)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) continue;
        zip.file(filename, await response.blob());
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const blobUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `linkedin_${(data.author || "post").replace(/\s+/g, "_")}_document.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      notifications.show({
        title: "Downloaded!",
        message: "LinkedIn slides saved as ZIP",
        color: "green",
      });
    } catch {
      notifications.show({
        title: "Download failed",
        message: "Could not create the LinkedIn ZIP",
        color: "red",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleVideoDownload = async () => {
    if (!postUrl) return;

    setDownloading(true);
    try {
      const response = await fetch(
        `/api/linkedin/download?url=${encodeURIComponent(postUrl)}`
      );
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `linkedin_${authorSlug}_video.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      notifications.show({
        title: "Downloaded!",
        message: `linkedin_${authorSlug}_video.mp4`,
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

  return (
    <Card radius="lg" withBorder p="lg">
      <Stack gap="lg">
        {/* Author info */}
        <Group gap="sm">
          <Badge size="lg" variant="light" color="blue" radius="lg">
            {data.author || "LinkedIn User"}
          </Badge>
          <Badge variant="light" color="gray" radius="lg">
            {data.type}
          </Badge>
          {data.type === "video" && data.videoQuality && (
            <Badge variant="light" color="green" radius="lg">
              {data.videoQuality}
            </Badge>
          )}
          {data.type === "document" && data.documentPageCount > 0 && (
            <Badge variant="light" color="indigo" radius="lg">
              {data.documentPageCount} pages
            </Badge>
          )}
        </Group>

        {data.title && (
          <Text fw={700} size="lg" lineClamp={2}>
            {data.title}
          </Text>
        )}

        {/* Video */}
        {data.type === "video" && data.videoUrl && (
          <Paper radius="md" style={{ overflow: "hidden" }}>
            <video
              src={
                postUrl
                  ? `/api/linkedin/download?url=${encodeURIComponent(postUrl)}`
                  : `/api/download?url=${encodeURIComponent(data.videoUrl)}&filename=preview.mp4`
              }
              controls
              style={{ width: "100%", maxHeight: 450, background: "#000" }}
              poster={data.image}
            />
          </Paper>
        )}

        {/* Image */}
        {data.type === "image" && data.image && (
          <Paper radius="md" style={{ overflow: "hidden" }}>
            <Image
              src={`/api/download?url=${encodeURIComponent(data.image)}&filename=preview.jpg`}
              alt="LinkedIn post"
              radius="md"
              fit="contain"
              h={400}
            />
          </Paper>
        )}

        {/* Document carousel */}
        {data.type === "document" && data.documentImages.length > 0 && (
          <Carousel
            withIndicators
            withControls
            styles={{
              control: { backgroundColor: "var(--mantine-color-dark-6)", border: "none", color: "#fff" },
            }}
          >
            {data.documentImages.map((img, i) => (
              <Carousel.Slide key={i}>
                <Paper radius="md" style={{ overflow: "hidden", position: "relative" }}>
                  <Image
                    src={`/api/download?url=${encodeURIComponent(img)}&filename=preview.jpg`}
                    alt={`Slide ${i + 1}`}
                    fit="contain"
                    h={450}
                  />
                  <Badge
                    style={{ position: "absolute", top: 12, right: 12 }}
                    variant="filled"
                    color="dark"
                  >
                    {i + 1}/{data.documentImages.length}
                  </Badge>
                </Paper>
              </Carousel.Slide>
            ))}
          </Carousel>
        )}

        {/* Text fallback */}
        {data.type === "text" && !data.image && (
          <Paper p="xl" radius="lg" bg="var(--mantine-color-dark-6)">
            <Text>{data.description || "No media content found in this post."}</Text>
          </Paper>
        )}

        {/* Description */}
        {data.description && (
          <Text size="sm" lineClamp={4} c="dimmed">
            {data.description}
          </Text>
        )}

        {/* Download buttons */}
        <Stack gap="sm">
          {data.type === "video" && data.videoUrl && (
            <Button
              size="lg"
              radius="xl"
              fullWidth
              onClick={postUrl ? handleVideoDownload : () =>
                handleDownload(
                  data.videoUrl!,
                  `linkedin_${authorSlug}_video.mp4`
                )
              }
              loading={downloading}
              leftSection={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              }
            >
              {data.videoQuality ? `Download Video (${data.videoQuality})` : "Download Video"}
            </Button>
          )}
          {data.type === "image" && data.image && (
            <Button
              size="lg"
              radius="xl"
              fullWidth
              onClick={() =>
                handleDownload(
                  data.image,
                  `linkedin_${authorSlug}_image.jpg`
                )
              }
              loading={downloading}
            >
              Download Image (HQ)
            </Button>
          )}
          {data.type === "document" && data.documentImages.length > 0 && (
            <>
              {data.documentPdfUrl && (
                <Button
                  size="lg"
                  radius="xl"
                  fullWidth
                  onClick={() =>
                    handleDownload(
                      data.documentPdfUrl!,
                      `linkedin_${authorSlug}_document.pdf`
                    )
                  }
                  loading={downloading}
                >
                  Download PDF
                </Button>
              )}
              <Button
                size="lg"
                radius="xl"
                fullWidth
                variant="light"
                onClick={handleDocumentDownload}
                loading={downloading}
              >
                Download Pages (ZIP)
              </Button>
            </>
          )}
          {data.type === "text" && (
            <Text ta="center" size="sm" c="dimmed">
              No downloadable media found. Try the Screenshot tab to capture this post.
            </Text>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
