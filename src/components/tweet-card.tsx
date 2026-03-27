"use client";

import { Paper, Group, Text, Avatar, Stack, Image, Box } from "@mantine/core";
import { forwardRef } from "react";
import type { TweetData } from "@/lib/twitter";
import { formatCount, formatDate, formatTime } from "@/lib/twitter";

export interface TweetCardTheme {
  cardBg: string;
  textColor: string;
  secondaryColor: string;
  borderColor: string;
  linkColor: string;
}

export const CARD_THEMES: Record<string, TweetCardTheme> = {
  dark: {
    cardBg: "#000000",
    textColor: "#e7e9ea",
    secondaryColor: "#71767b",
    borderColor: "#2f3336",
    linkColor: "#1d9bf0",
  },
  light: {
    cardBg: "#ffffff",
    textColor: "#0f1419",
    secondaryColor: "#536471",
    borderColor: "#eff3f4",
    linkColor: "#1d9bf0",
  },
  dim: {
    cardBg: "#15202b",
    textColor: "#f7f9f9",
    secondaryColor: "#8b98a5",
    borderColor: "#38444d",
    linkColor: "#1d9bf0",
  },
};

export interface TweetCardSettings {
  theme: "dark" | "light" | "dim";
  bgStyle: "solid" | "gradient" | "transparent";
  bgColor: string;
  bgGradient: string;
  padding: number;
  scale: number;
  borderRadius: number;
  shadow: boolean;
  shadowIntensity: number;
  fontSize: "sm" | "md" | "lg";
  showAvatar: boolean;
  showMetrics: boolean;
  showTimestamp: boolean;
  showVerified: boolean;
  watermark: string;
  aspectRatio: "auto" | "1:1" | "16:9" | "4:5" | "9:16";
}

export const DEFAULT_SETTINGS: TweetCardSettings = {
  theme: "dark",
  bgStyle: "gradient",
  bgColor: "#1a1a2e",
  bgGradient: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
  padding: 48,
  scale: 2,
  borderRadius: 20,
  shadow: true,
  shadowIntensity: 40,
  fontSize: "md",
  showAvatar: true,
  showMetrics: true,
  showTimestamp: true,
  showVerified: true,
  watermark: "",
  aspectRatio: "auto",
};

const FONT_SIZES = { sm: 14, md: 16, lg: 18 };

interface TweetCardProps {
  tweet: TweetData;
  settings: TweetCardSettings;
}

function highlightText(text: string, linkColor: string) {
  const parts = text.split(/([@#][\w]+|https?:\/\/\S+)/g);
  return parts.map((part, i) => {
    if (/^[@#]/.test(part) || /^https?:\/\//.test(part)) {
      return (
        <span key={i} style={{ color: linkColor }}>
          {part}
        </span>
      );
    }
    return part;
  });
}

function getAspectRatioStyle(ratio: string): React.CSSProperties {
  switch (ratio) {
    case "1:1": return { aspectRatio: "1/1" };
    case "16:9": return { aspectRatio: "16/9" };
    case "4:5": return { aspectRatio: "4/5" };
    case "9:16": return { aspectRatio: "9/16" };
    default: return {};
  }
}

export const TweetCard = forwardRef<HTMLDivElement, TweetCardProps>(
  function TweetCard({ tweet, settings }, ref) {
    const cardTheme = CARD_THEMES[settings.theme];
    const fontSize = FONT_SIZES[settings.fontSize];

    const bgStyle: React.CSSProperties =
      settings.bgStyle === "gradient"
        ? { background: settings.bgGradient }
        : settings.bgStyle === "transparent"
        ? { background: "transparent" }
        : { background: settings.bgColor };

    const shadowStyle = settings.shadow
      ? `0 ${settings.shadowIntensity / 2}px ${settings.shadowIntensity}px rgba(0,0,0,0.3)`
      : "none";

    return (
      <div
        ref={ref}
        style={{
          ...bgStyle,
          padding: settings.padding,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          ...getAspectRatioStyle(settings.aspectRatio),
        }}
      >
        <Paper
          p="xl"
          style={{
            background: cardTheme.cardBg,
            borderRadius: settings.borderRadius,
            boxShadow: shadowStyle,
            width: "100%",
            maxWidth: 550,
            border: `1px solid ${cardTheme.borderColor}`,
          }}
        >
          <Stack gap="md">
            {/* Header */}
            <Group gap="sm" wrap="nowrap">
              {settings.showAvatar && (
                <Avatar
                  src={tweet.user.profile_image_url}
                  size={48}
                  radius="xl"
                  alt={tweet.user.name}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Group gap={4} wrap="nowrap">
                  <Text
                    size="sm"
                    fw={700}
                    style={{ color: cardTheme.textColor }}
                    truncate
                  >
                    {tweet.user.name}
                  </Text>
                  {settings.showVerified && tweet.user.is_blue_verified && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1d9bf0">
                      <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.47 1.39-.2 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
                    </svg>
                  )}
                </Group>
                <Text size="xs" style={{ color: cardTheme.secondaryColor }}>
                  @{tweet.user.screen_name}
                </Text>
              </div>
              {/* X logo */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill={cardTheme.secondaryColor}>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </Group>

            {/* Tweet text */}
            <Text
              style={{
                color: cardTheme.textColor,
                fontSize,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {highlightText(tweet.text, cardTheme.linkColor)}
            </Text>

            {/* Media */}
            {tweet.media_url && (
              <Box style={{ borderRadius: 16, overflow: "hidden" }}>
                <Image
                  src={tweet.media_url}
                  alt="Tweet media"
                  radius={0}
                  fit="cover"
                />
              </Box>
            )}

            {/* Quoted tweet */}
            {tweet.quoted_tweet && (
              <Paper
                p="md"
                style={{
                  border: `1px solid ${cardTheme.borderColor}`,
                  borderRadius: 16,
                  background: "transparent",
                }}
              >
                <Group gap="xs" mb={4}>
                  <Avatar
                    src={tweet.quoted_tweet.user.profile_image_url}
                    size={20}
                    radius="xl"
                  />
                  <Text size="xs" fw={700} style={{ color: cardTheme.textColor }}>
                    {tweet.quoted_tweet.user.name}
                  </Text>
                  <Text size="xs" style={{ color: cardTheme.secondaryColor }}>
                    @{tweet.quoted_tweet.user.screen_name}
                  </Text>
                </Group>
                <Text
                  size="sm"
                  style={{ color: cardTheme.textColor, lineHeight: 1.4 }}
                  lineClamp={3}
                >
                  {tweet.quoted_tweet.text}
                </Text>
              </Paper>
            )}

            {/* Timestamp */}
            {settings.showTimestamp && (
              <Text size="xs" style={{ color: cardTheme.secondaryColor }}>
                {formatTime(tweet.created_at)} &middot; {formatDate(tweet.created_at)}
              </Text>
            )}

            {/* Metrics */}
            {settings.showMetrics && (
              <Group
                gap="lg"
                pt="sm"
                style={{
                  borderTop: `1px solid ${cardTheme.borderColor}`,
                }}
              >
                <Group gap={4}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cardTheme.secondaryColor} strokeWidth="1.5">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  <Text size="xs" style={{ color: cardTheme.secondaryColor }}>
                    {formatCount(tweet.reply_count)}
                  </Text>
                </Group>
                <Group gap={4}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cardTheme.secondaryColor} strokeWidth="1.5">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                  <Text size="xs" style={{ color: cardTheme.secondaryColor }}>
                    {formatCount(tweet.retweet_count)}
                  </Text>
                </Group>
                <Group gap={4}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cardTheme.secondaryColor} strokeWidth="1.5">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <Text size="xs" style={{ color: cardTheme.secondaryColor }}>
                    {formatCount(tweet.favorite_count)}
                  </Text>
                </Group>
                {tweet.views_count && tweet.views_count !== "0" && (
                  <Group gap={4}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cardTheme.secondaryColor} strokeWidth="1.5">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <Text size="xs" style={{ color: cardTheme.secondaryColor }}>
                      {formatCount(parseInt(tweet.views_count))} views
                    </Text>
                  </Group>
                )}
              </Group>
            )}
          </Stack>
        </Paper>

        {/* Watermark */}
        {settings.watermark && (
          <Text
            size="xs"
            fw={500}
            style={{
              position: "absolute",
              bottom: settings.padding / 2,
              right: settings.padding,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: 0.5,
            }}
          >
            {settings.watermark}
          </Text>
        )}
      </div>
    );
  }
);
