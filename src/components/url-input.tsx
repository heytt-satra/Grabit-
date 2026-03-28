"use client";

import { TextInput, Button, Group, Paper, Text, Stack } from "@mantine/core";
import { useState, useCallback } from "react";
import { isValidUrl, detectPlatform } from "@/lib/platforms";
import { PlatformBadge } from "./platform-badge";

interface UrlInputProps {
  onSubmit: (url: string) => void;
  loading?: boolean;
  placeholder?: string;
}

export function UrlInput({
  onSubmit,
  loading = false,
  placeholder = "Paste any URL - Twitter, Instagram, YouTube, or any website...",
}: UrlInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const detectedPlatform =
    url.trim() && isValidUrl(url.trim()) ? detectPlatform(url.trim()) : null;

  const handleSubmit = useCallback(() => {
    if (!url.trim()) {
      setError("Please enter a URL");
      return;
    }

    if (!isValidUrl(url.trim())) {
      setError("Please enter a valid URL");
      return;
    }

    setError("");
    onSubmit(url.trim());
  }, [url, onSubmit]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const pasted = event.clipboardData.getData("text");
      if (isValidUrl(pasted.trim())) {
        setError("");
        setTimeout(() => onSubmit(pasted.trim()), 100);
      }
    },
    [onSubmit]
  );

  return (
    <Paper p="xl" radius="xl" withBorder>
      <Stack gap="sm">
        <Group gap="sm" align="flex-start">
          <TextInput
            flex={1}
            size="lg"
            radius="xl"
            placeholder={placeholder}
            value={url}
            onChange={(event) => {
              setUrl(event.currentTarget.value);
              setError("");
            }}
            onPaste={handlePaste}
            onKeyDown={(event) => event.key === "Enter" && handleSubmit()}
            error={error}
            styles={{
              input: {
                fontSize: "16px",
              },
            }}
          />
          <Button
            size="lg"
            radius="xl"
            onClick={handleSubmit}
            loading={loading}
            px="xl"
          >
            Go
          </Button>
        </Group>
        <Group justify="center" gap="xs">
          {detectedPlatform ? (
            <PlatformBadge platform={detectedPlatform} />
          ) : (
            <Text size="xs" c="dimmed">
              Supports X, Instagram, YouTube, and any website
            </Text>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
