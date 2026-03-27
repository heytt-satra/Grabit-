"use client";

import { Paper, Group, Text, Image, Avatar, Stack, Box } from "@mantine/core";
import { forwardRef } from "react";
import type { TweetCardSettings } from "./tweet-card";
import { CARD_THEMES } from "./tweet-card";

export interface PageMeta {
  title: string;
  description: string;
  siteName: string;
  favicon: string;
  image: string;
  author: string;
  publishedDate: string;
  url: string;
  domain: string;
}

interface ContentCardProps {
  meta: PageMeta;
  settings: TweetCardSettings;
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

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export const ContentCard = forwardRef<HTMLDivElement, ContentCardProps>(
  function ContentCard({ meta, settings }, ref) {
    const cardTheme = CARD_THEMES[settings.theme];
    const FONT_SIZES = { sm: 14, md: 16, lg: 18 };
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
            overflow: "hidden",
          }}
        >
          <Stack gap="md">
            {/* Site header */}
            <Group gap="sm" wrap="nowrap">
              {settings.showAvatar && meta.favicon && (
                <Avatar
                  src={meta.favicon}
                  size={28}
                  radius="sm"
                  alt={meta.siteName}
                >
                  {meta.siteName?.[0]?.toUpperCase()}
                </Avatar>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text
                  size="xs"
                  fw={600}
                  style={{ color: cardTheme.textColor }}
                  truncate
                >
                  {meta.siteName || meta.domain}
                </Text>
                <Text
                  size="xs"
                  style={{ color: cardTheme.secondaryColor }}
                  truncate
                >
                  {meta.domain}
                </Text>
              </div>
            </Group>

            {/* Preview image */}
            {meta.image && settings.showMetrics && (
              <Box style={{ borderRadius: 12, overflow: "hidden", margin: "0 -4px" }}>
                <Image
                  src={meta.image}
                  alt={meta.title}
                  radius={0}
                  fit="cover"
                  h={200}
                />
              </Box>
            )}

            {/* Title */}
            <Text
              fw={700}
              style={{
                color: cardTheme.textColor,
                fontSize: fontSize + 2,
                lineHeight: 1.3,
              }}
              lineClamp={3}
            >
              {meta.title}
            </Text>

            {/* Description */}
            {meta.description && (
              <Text
                style={{
                  color: cardTheme.secondaryColor,
                  fontSize: fontSize - 2,
                  lineHeight: 1.5,
                }}
                lineClamp={4}
              >
                {meta.description}
              </Text>
            )}

            {/* Footer: author + date */}
            {settings.showTimestamp && (meta.author || meta.publishedDate) && (
              <Group
                gap="sm"
                pt="sm"
                style={{ borderTop: `1px solid ${cardTheme.borderColor}` }}
              >
                {meta.author && (
                  <Text size="xs" style={{ color: cardTheme.secondaryColor }}>
                    {meta.author}
                  </Text>
                )}
                {meta.author && meta.publishedDate && (
                  <Text size="xs" style={{ color: cardTheme.secondaryColor }}>·</Text>
                )}
                {meta.publishedDate && (
                  <Text size="xs" style={{ color: cardTheme.secondaryColor }}>
                    {formatDate(meta.publishedDate)}
                  </Text>
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
