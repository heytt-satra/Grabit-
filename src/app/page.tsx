"use client";

import {
  Container,
  Title,
  Text,
  Tabs,
  Stack,
  Group,
  Grid,
  Skeleton,
  Paper,
  Anchor,
  Box,
  Card,
  Image,
  Badge,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng, toJpeg } from "html-to-image";

import { ThemeToggle } from "@/components/theme-toggle";
import { UrlInput } from "@/components/url-input";
import { PlatformBadge } from "@/components/platform-badge";
import { VideoPicker } from "@/components/video-picker";
import { InstagramViewer } from "@/components/instagram-viewer";
import { YouTubeViewer } from "@/components/youtube-viewer";
import { LinkedInViewer } from "@/components/linkedin-viewer";
import { ScreenCapture } from "@/components/screen-capture";
import {
  TweetCard,
  DEFAULT_SETTINGS,
  type TweetCardSettings,
} from "@/components/tweet-card";
import { ContentCard, type PageMeta } from "@/components/content-card";
import { ScreenshotEditor } from "@/components/screenshot-editor";
import { detectPlatform, type Platform } from "@/lib/platforms";
import type { TweetData, VideoData } from "@/lib/twitter";

const MotionDiv = motion.div;

interface InstaMedia {
  type: "image" | "video";
  url: string;
  thumbnail?: string;
}

interface InstaPostData {
  shortcode: string;
  caption: string;
  author: string;
  authorPic: string;
  timestamp: string;
  likeCount: number;
  commentCount: number;
  isCarousel: boolean;
  media: InstaMedia[];
}

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
  authorUrl: string;
  thumbnail: string;
  duration: string;
  viewCount: string;
  description: string;
  formats: YTFormat[];
  thumbnails: YTThumbnail[];
}

interface LinkedInPostData {
  title: string;
  description: string;
  author: string;
  authorImage: string;
  image: string;
  videoUrl: string | null;
  documentImages: string[];
  type: "video" | "image" | "document" | "text";
}

export default function Home() {
  const [topTab, setTopTab] = useState<string | null>("grab");
  const [activeTab, setActiveTab] = useState<string | null>("download");
  const [currentUrl, setCurrentUrl] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(false);

  // Twitter state
  const [tweet, setTweet] = useState<TweetData | null>(null);
  const [video, setVideo] = useState<VideoData | null>(null);

  // Instagram state
  const [instaData, setInstaData] = useState<InstaPostData | null>(null);

  // YouTube state
  const [ytData, setYtData] = useState<YTVideoInfo | null>(null);

  // LinkedIn state
  const [linkedinData, setLinkedinData] = useState<LinkedInPostData | null>(null);

  // Universal screenshot state
  const [pageMeta, setPageMeta] = useState<PageMeta | null>(null);

  // Screenshot settings
  const [settings, setSettings] = useState<TweetCardSettings>(DEFAULT_SETTINGS);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const resetAll = () => {
    setTweet(null);
    setVideo(null);
    setInstaData(null);
    setYtData(null);
    setLinkedinData(null);
    setPageMeta(null);
  };

  const fetchContent = useCallback(async (url: string) => {
    const detected = detectPlatform(url);
    setPlatform(detected);
    setCurrentUrl(url);
    setActiveTab("download");
    resetAll();
    setLoading(true);

    try {
      switch (detected) {
        case "twitter": {
          const [tweetResp, videoResp] = await Promise.allSettled([
            fetch(`/api/tweet?url=${encodeURIComponent(url)}`),
            fetch(`/api/video?url=${encodeURIComponent(url)}`),
          ]);

          if (tweetResp.status === "fulfilled" && tweetResp.value.ok) {
            setTweet(await tweetResp.value.json());
          } else {
            throw new Error("Failed to fetch tweet");
          }

          if (videoResp.status === "fulfilled" && videoResp.value.ok) {
            setVideo(await videoResp.value.json());
          }
          break;
        }
        case "instagram": {
          const resp = await fetch(`/api/instagram?url=${encodeURIComponent(url)}`);
          if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to fetch Instagram data");
          }
          setInstaData(await resp.json());
          break;
        }
        case "youtube": {
          const resp = await fetch(`/api/youtube?url=${encodeURIComponent(url)}`);
          if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to fetch YouTube data");
          }
          setYtData(await resp.json());
          break;
        }
        case "linkedin": {
          const resp = await fetch(`/api/linkedin?url=${encodeURIComponent(url)}`);
          if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to fetch LinkedIn data");
          }
          setLinkedinData(await resp.json());
          break;
        }
        case "universal": {
          setActiveTab("screenshot");
          const resp = await fetch(`/api/screenshot?url=${encodeURIComponent(url)}`);
          if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to fetch page data");
          }
          setPageMeta(await resp.json());
          break;
        }
      }

      // Also fetch page meta for screenshot tab on all platforms
      if (detected !== "universal") {
        try {
          const metaResp = await fetch(`/api/screenshot?url=${encodeURIComponent(url)}`);
          if (metaResp.ok) {
            setPageMeta(await metaResp.json());
          }
        } catch {
          // screenshot meta is optional
        }
      }
    } catch (err) {
      notifications.show({
        title: "Error",
        message: err instanceof Error ? err.message : "Failed to fetch content",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExport = useCallback(
    async (format: "png" | "jpg") => {
      if (!cardRef.current) return;
      setExporting(true);
      try {
        const fn = format === "png" ? toPng : toJpeg;
        const dataUrl = await fn(cardRef.current, {
          pixelRatio: settings.scale,
          quality: 0.95,
        });

        const link = document.createElement("a");
        link.download = `screenshot.${format}`;
        link.href = dataUrl;
        link.click();

        notifications.show({
          title: "Exported!",
          message: `Screenshot saved as ${format.toUpperCase()}`,
          color: "green",
        });
      } catch {
        notifications.show({
          title: "Export failed",
          message: "Could not generate screenshot. Try a smaller scale.",
          color: "red",
        });
      } finally {
        setExporting(false);
      }
    },
    [settings.scale]
  );

  const handleCopy = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: settings.scale });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      notifications.show({ title: "Copied!", message: "Screenshot copied to clipboard", color: "green" });
    } catch {
      notifications.show({ title: "Copy failed", message: "Could not copy to clipboard", color: "red" });
    }
  }, [settings.scale]);

  const hasContent = tweet || instaData || ytData || linkedinData || pageMeta || loading;

  // Determine if screenshot is available
  const canScreenshot = platform === "twitter" ? !!tweet : !!pageMeta;

  return (
    <Box mih="100vh">
      {/* Header */}
      <Container size="lg" py="lg">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--mantine-color-blue-5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <Title order={3} fw={800}>
              GrabIt
            </Title>
          </Group>
          <ThemeToggle />
        </Group>
      </Container>

      {/* Hero */}
      <Container size="sm" py="xl">
        <Stack align="center" gap="lg">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ textAlign: "center" }}
          >
            <Title
              order={1}
              fz={{ base: 32, sm: 44 }}
              fw={800}
              mb="sm"
              style={{ lineHeight: 1.2 }}
            >
              Download &{" "}
              <Text
                component="span"
                inherit
                variant="gradient"
                gradient={{ from: "blue", to: "cyan" }}
              >
                Screenshot
              </Text>{" "}
              Anything
            </Title>
            <Text size="lg" c="dimmed" maw={540} mx="auto">
              Grab videos from X, Instagram, YouTube & LinkedIn.
              Create beautiful screenshots of any content. No login required.
            </Text>
          </MotionDiv>
        </Stack>
      </Container>

      {/* Top-level tabs: Grab / Snip */}
      <Container size="lg" pb="xl">
        <Tabs value={topTab} onChange={setTopTab} radius="lg" variant="pills">
          <Tabs.List justify="center" mb="xl">
            <Tabs.Tab value="grab" fz="md" px="xl" leftSection={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            }>
              Grab
            </Tabs.Tab>
            <Tabs.Tab value="snip" fz="md" px="xl" leftSection={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" />
                <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
              </svg>
            }>
              Snip
            </Tabs.Tab>
          </Tabs.List>

          {/* ===== GRAB TAB ===== */}
          <Tabs.Panel value="grab">
            {/* URL Input */}
            <Container size="sm" mb="xl">
              <MotionDiv
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
              >
                <UrlInput onSubmit={fetchContent} loading={loading} />
              </MotionDiv>
            </Container>

            {/* Grab content */}
            {hasContent && (
              <MotionDiv
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                {/* Platform badge */}
                {platform && (
                  <Group justify="center" mb="lg">
                    <PlatformBadge platform={platform} />
                  </Group>
                )}

                <Tabs
                  value={activeTab}
                  onChange={setActiveTab}
                  radius="lg"
                  variant="outline"
                  mb="xl"
                >
                  <Tabs.List justify="center">
                    <Tabs.Tab value="download" fz="md" px="xl">
                      {platform === "universal" ? "Info" : "Download"}
                    </Tabs.Tab>
                    <Tabs.Tab value="screenshot" fz="md" px="xl">
                      Screenshot
                    </Tabs.Tab>
                  </Tabs.List>

                  <AnimatePresence mode="wait">
                    {/* DOWNLOAD TAB */}
                    <Tabs.Panel value="download" pt="xl">
                      <MotionDiv
                        key="download"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.25 }}
                      >
                        <Container size="sm">
                          {loading ? (
                            <Stack gap="md">
                              <Skeleton h={350} radius="lg" />
                              <Skeleton h={50} radius="lg" />
                            </Stack>
                          ) : (
                            <>
                              {platform === "twitter" && (
                                video ? (
                                  <VideoPicker video={video} loading={false} tweetUrl={currentUrl} />
                                ) : (
                                  <Paper p="xl" radius="lg" withBorder ta="center">
                                    <Text c="dimmed" size="lg">No video found in this tweet.</Text>
                                    <Text c="dimmed" size="sm" mt="xs">
                                      Switch to the Screenshot tab to capture the tweet.
                                    </Text>
                                  </Paper>
                                )
                              )}

                              {platform === "instagram" && (
                                <InstagramViewer data={instaData} loading={false} />
                              )}

                              {platform === "youtube" && (
                                <YouTubeViewer data={ytData} loading={false} />
                              )}

                              {platform === "linkedin" && (
                                <LinkedInViewer data={linkedinData} loading={false} />
                              )}

                              {platform === "universal" && pageMeta && (
                                <Card radius="lg" withBorder p="lg">
                                  <Stack gap="md">
                                    {pageMeta.image && (
                                      <Image
                                        src={pageMeta.image}
                                        alt={pageMeta.title}
                                        radius="md"
                                        fit="cover"
                                        h={250}
                                      />
                                    )}
                                    <Text fw={700} size="lg">{pageMeta.title}</Text>
                                    {pageMeta.description && (
                                      <Text size="sm" c="dimmed" lineClamp={4}>
                                        {pageMeta.description}
                                      </Text>
                                    )}
                                    <Group gap="sm">
                                      {pageMeta.siteName && (
                                        <Badge variant="light" radius="lg">{pageMeta.siteName}</Badge>
                                      )}
                                      {pageMeta.author && (
                                        <Badge variant="light" color="gray" radius="lg">{pageMeta.author}</Badge>
                                      )}
                                    </Group>
                                    <Text ta="center" size="sm" c="dimmed" mt="md">
                                      Switch to the Screenshot tab to create a beautiful card.
                                    </Text>
                                  </Stack>
                                </Card>
                              )}

                              {!loading && !tweet && !instaData && !ytData && !linkedinData && !pageMeta && (
                                <Paper p="xl" radius="lg" withBorder ta="center">
                                  <Text c="dimmed" size="lg">
                                    Could not fetch content from this URL.
                                  </Text>
                                  <Text c="dimmed" size="sm" mt="xs">
                                    The content may be private, deleted, or not supported.
                                  </Text>
                                </Paper>
                              )}
                            </>
                          )}
                        </Container>
                      </MotionDiv>
                    </Tabs.Panel>

                    {/* SCREENSHOT TAB */}
                    <Tabs.Panel value="screenshot" pt="xl">
                      <MotionDiv
                        key="screenshot"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.25 }}
                      >
                        {loading ? (
                          <Grid gutter="xl">
                            <Grid.Col span={{ base: 12, md: 8 }}>
                              <Skeleton h={400} radius="lg" />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                              <Skeleton h={400} radius="lg" />
                            </Grid.Col>
                          </Grid>
                        ) : canScreenshot ? (
                          <Grid gutter="xl">
                            <Grid.Col span={{ base: 12, md: 8 }}>
                              <Paper radius="lg" withBorder style={{ overflow: "hidden" }}>
                                <Box
                                  p="md"
                                  style={{
                                    background:
                                      "repeating-conic-gradient(#80808015 0% 25%, transparent 0% 50%) 50% / 20px 20px",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    minHeight: 300,
                                  }}
                                >
                                  <Box maw={650} w="100%">
                                    {platform === "twitter" && tweet ? (
                                      <TweetCard
                                        ref={cardRef}
                                        tweet={tweet}
                                        settings={settings}
                                      />
                                    ) : pageMeta ? (
                                      <ContentCard
                                        ref={cardRef}
                                        meta={pageMeta}
                                        settings={settings}
                                      />
                                    ) : null}
                                  </Box>
                                </Box>
                              </Paper>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                              <Paper radius="lg" withBorder>
                                <ScreenshotEditor
                                  settings={settings}
                                  onChange={setSettings}
                                  onExport={handleExport}
                                  onCopy={handleCopy}
                                  exporting={exporting}
                                />
                              </Paper>
                            </Grid.Col>
                          </Grid>
                        ) : (
                          <Paper p="xl" radius="lg" withBorder ta="center">
                            <Text c="dimmed" size="lg">
                              Screenshot not available yet.
                            </Text>
                            <Text c="dimmed" size="sm" mt="xs">
                              Fetching page metadata...
                            </Text>
                          </Paper>
                        )}
                      </MotionDiv>
                    </Tabs.Panel>
                  </AnimatePresence>
                </Tabs>
              </MotionDiv>
            )}
          </Tabs.Panel>

          {/* ===== SNIP TAB ===== */}
          <Tabs.Panel value="snip">
            <Container size="sm">
              <ScreenCapture />
            </Container>
          </Tabs.Panel>
        </Tabs>
      </Container>

      {/* Footer */}
      <Box
        component="footer"
        py="xl"
        mt="auto"
        style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
      >
        <Container size="lg">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text size="xs" c="dimmed">
              GrabIt is not affiliated with X, Instagram, LinkedIn, or YouTube.
              For personal use only. Respect content creators&apos; rights.
            </Text>
            <Text size="xs" c="dimmed">
              Built with{" "}
              <Anchor href="https://nextjs.org" target="_blank" size="xs" c="dimmed" td="underline">
                Next.js
              </Anchor>
              {" & "}
              <Anchor href="https://mantine.dev" target="_blank" size="xs" c="dimmed" td="underline">
                Mantine
              </Anchor>
            </Text>
          </Group>
        </Container>
      </Box>
    </Box>
  );
}
