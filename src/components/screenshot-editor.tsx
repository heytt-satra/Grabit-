"use client";

import {
  Stack,
  Text,
  SegmentedControl,
  Slider,
  Switch,
  TextInput,
  ColorInput,
  Select,
  Paper,
  Group,
  Button,
  Divider,
  ScrollArea,
} from "@mantine/core";
import type { TweetCardSettings } from "./tweet-card";

const GRADIENT_PRESETS = [
  { label: "Midnight", value: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" },
  { label: "Ocean", value: "linear-gradient(135deg, #0093E9, #80D0C7)" },
  { label: "Sunset", value: "linear-gradient(135deg, #f093fb, #f5576c)" },
  { label: "Forest", value: "linear-gradient(135deg, #11998e, #38ef7d)" },
  { label: "Lavender", value: "linear-gradient(135deg, #a18cd1, #fbc2eb)" },
  { label: "Fire", value: "linear-gradient(135deg, #f12711, #f5af19)" },
  { label: "Night Sky", value: "linear-gradient(135deg, #2c3e50, #4ca1af)" },
  { label: "Berry", value: "linear-gradient(135deg, #8E2DE2, #4A00E0)" },
  { label: "Coral", value: "linear-gradient(135deg, #ff9a9e, #fecfef)" },
  { label: "Arctic", value: "linear-gradient(135deg, #e0eafc, #cfdef3)" },
];

interface ScreenshotEditorProps {
  settings: TweetCardSettings;
  onChange: (settings: TweetCardSettings) => void;
  onExport: (format: "png" | "jpg") => void;
  onCopy: () => void;
  exporting: boolean;
}

export function ScreenshotEditor({
  settings,
  onChange,
  onExport,
  onCopy,
  exporting,
}: ScreenshotEditorProps) {
  const update = <K extends keyof TweetCardSettings>(
    key: K,
    value: TweetCardSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <ScrollArea h="calc(100vh - 200px)" offsetScrollbars>
      <Stack gap="lg" p="md">
        {/* Theme */}
        <div>
          <Text size="sm" fw={600} mb={6}>
            Card Theme
          </Text>
          <SegmentedControl
            fullWidth
            data={[
              { label: "Dark", value: "dark" },
              { label: "Light", value: "light" },
              { label: "Dim", value: "dim" },
            ]}
            value={settings.theme}
            onChange={(v) => update("theme", v as TweetCardSettings["theme"])}
            radius="lg"
          />
        </div>

        <Divider />

        {/* Background */}
        <div>
          <Text size="sm" fw={600} mb={6}>
            Background
          </Text>
          <SegmentedControl
            fullWidth
            data={[
              { label: "Gradient", value: "gradient" },
              { label: "Solid", value: "solid" },
              { label: "None", value: "transparent" },
            ]}
            value={settings.bgStyle}
            onChange={(v) =>
              update("bgStyle", v as TweetCardSettings["bgStyle"])
            }
            radius="lg"
            mb="sm"
          />

          {settings.bgStyle === "gradient" && (
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                Presets
              </Text>
              <Group gap={6}>
                {GRADIENT_PRESETS.map((g) => (
                  <Paper
                    key={g.label}
                    w={36}
                    h={36}
                    radius="md"
                    style={{
                      background: g.value,
                      cursor: "pointer",
                      border:
                        settings.bgGradient === g.value
                          ? "2px solid var(--mantine-color-blue-5)"
                          : "2px solid transparent",
                      transition: "border-color 0.15s",
                    }}
                    onClick={() => update("bgGradient", g.value)}
                    title={g.label}
                  />
                ))}
              </Group>
            </Stack>
          )}

          {settings.bgStyle === "solid" && (
            <ColorInput
              value={settings.bgColor}
              onChange={(v) => update("bgColor", v)}
              format="hex"
              swatches={[
                "#000000", "#1a1a2e", "#16213e", "#0f3460",
                "#ffffff", "#f5f5f5", "#e8e8e8", "#fef9ef",
              ]}
            />
          )}
        </div>

        <Divider />

        {/* Layout */}
        <div>
          <Text size="sm" fw={600} mb={6}>
            Padding
          </Text>
          <Slider
            min={16}
            max={96}
            step={4}
            value={settings.padding}
            onChange={(v) => update("padding", v)}
            marks={[
              { value: 16, label: "S" },
              { value: 48, label: "M" },
              { value: 96, label: "L" },
            ]}
          />
        </div>

        <div>
          <Text size="sm" fw={600} mb={6}>
            Border Radius
          </Text>
          <Slider
            min={0}
            max={40}
            step={2}
            value={settings.borderRadius}
            onChange={(v) => update("borderRadius", v)}
          />
        </div>

        <div>
          <Group justify="space-between" mb={6}>
            <Text size="sm" fw={600}>
              Shadow
            </Text>
            <Switch
              checked={settings.shadow}
              onChange={(e) => update("shadow", e.currentTarget.checked)}
              size="sm"
            />
          </Group>
          {settings.shadow && (
            <Slider
              min={10}
              max={80}
              value={settings.shadowIntensity}
              onChange={(v) => update("shadowIntensity", v)}
            />
          )}
        </div>

        <Divider />

        {/* Typography */}
        <div>
          <Text size="sm" fw={600} mb={6}>
            Font Size
          </Text>
          <SegmentedControl
            fullWidth
            data={[
              { label: "Small", value: "sm" },
              { label: "Medium", value: "md" },
              { label: "Large", value: "lg" },
            ]}
            value={settings.fontSize}
            onChange={(v) =>
              update("fontSize", v as TweetCardSettings["fontSize"])
            }
            radius="lg"
          />
        </div>

        <Divider />

        {/* Visibility */}
        <div>
          <Text size="sm" fw={600} mb={10}>
            Show / Hide
          </Text>
          <Stack gap="xs">
            <Switch
              label="Profile picture"
              checked={settings.showAvatar}
              onChange={(e) => update("showAvatar", e.currentTarget.checked)}
            />
            <Switch
              label="Metrics (likes, retweets)"
              checked={settings.showMetrics}
              onChange={(e) => update("showMetrics", e.currentTarget.checked)}
            />
            <Switch
              label="Timestamp"
              checked={settings.showTimestamp}
              onChange={(e) => update("showTimestamp", e.currentTarget.checked)}
            />
            <Switch
              label="Verified badge"
              checked={settings.showVerified}
              onChange={(e) => update("showVerified", e.currentTarget.checked)}
            />
          </Stack>
        </div>

        <Divider />

        {/* Aspect Ratio */}
        <Select
          label="Aspect Ratio"
          data={[
            { label: "Auto", value: "auto" },
            { label: "Square (1:1)", value: "1:1" },
            { label: "Landscape (16:9)", value: "16:9" },
            { label: "Portrait (4:5)", value: "4:5" },
            { label: "Story (9:16)", value: "9:16" },
          ]}
          value={settings.aspectRatio}
          onChange={(v) =>
            update("aspectRatio", (v || "auto") as TweetCardSettings["aspectRatio"])
          }
          radius="md"
        />

        {/* Scale */}
        <div>
          <Text size="sm" fw={600} mb={6}>
            Export Scale
          </Text>
          <SegmentedControl
            fullWidth
            data={[
              { label: "1x", value: "1" },
              { label: "2x", value: "2" },
              { label: "3x", value: "3" },
              { label: "4x", value: "4" },
            ]}
            value={String(settings.scale)}
            onChange={(v) => update("scale", parseInt(v))}
            radius="lg"
          />
        </div>

        <Divider />

        {/* Watermark */}
        <TextInput
          label="Watermark"
          placeholder="e.g. @yourusername"
          value={settings.watermark}
          onChange={(e) => update("watermark", e.currentTarget.value)}
          radius="md"
        />

        <Divider />

        {/* Export */}
        <Stack gap="sm">
          <Group grow>
            <Button
              radius="xl"
              size="md"
              onClick={() => onExport("png")}
              loading={exporting}
            >
              Save PNG
            </Button>
            <Button
              radius="xl"
              size="md"
              variant="light"
              onClick={() => onExport("jpg")}
              loading={exporting}
            >
              Save JPG
            </Button>
          </Group>
          <Button
            radius="xl"
            size="md"
            variant="outline"
            onClick={onCopy}
            fullWidth
          >
            Copy to Clipboard
          </Button>
        </Stack>
      </Stack>
    </ScrollArea>
  );
}
