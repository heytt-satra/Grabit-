"use client";

import { Box, Button, Group, Text } from "@mantine/core";
import { useRef, useState, useCallback, useEffect } from "react";

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RegionSelectorProps {
  imageSrc: string; // data URL of captured frame
  sourceWidth: number;
  sourceHeight: number;
  onSelect: (rect: CropRect) => void;
  onCancel: () => void;
}

export function RegionSelector({
  imageSrc,
  sourceWidth,
  sourceHeight,
  onSelect,
  onCancel,
}: RegionSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<CropRect | null>(null);
  const [scale, setScale] = useState(1);

  // Load image and draw initial frame
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      drawCanvas(img, null);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Calculate scale when container resizes
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const maxHeight = window.innerHeight * 0.6;
      const scaleW = containerWidth / sourceWidth;
      const scaleH = maxHeight / sourceHeight;
      setScale(Math.min(scaleW, scaleH, 1));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [sourceWidth, sourceHeight]);

  const drawCanvas = useCallback(
    (img: HTMLImageElement, rect: CropRect | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const displayW = Math.round(sourceWidth * scale);
      const displayH = Math.round(sourceHeight * scale);
      canvas.width = displayW;
      canvas.height = displayH;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw the captured image
      ctx.drawImage(img, 0, 0, displayW, displayH);

      // Draw overlay if there's a selection
      if (rect) {
        // Dark overlay
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, displayW, displayH);

        // Clear the selected region to show original image
        ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
        ctx.drawImage(
          img,
          rect.x / scale,
          rect.y / scale,
          rect.w / scale,
          rect.h / scale,
          rect.x,
          rect.y,
          rect.w,
          rect.h
        );

        // Draw selection border
        ctx.strokeStyle = "#228be6";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.setLineDash([]);

        // Draw corner handles
        const handleSize = 8;
        ctx.fillStyle = "#228be6";
        const corners = [
          [rect.x, rect.y],
          [rect.x + rect.w, rect.y],
          [rect.x, rect.y + rect.h],
          [rect.x + rect.w, rect.y + rect.h],
        ];
        for (const [cx, cy] of corners) {
          ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        }

        // Dimension label
        const srcW = Math.round(rect.w / scale);
        const srcH = Math.round(rect.h / scale);
        ctx.fillStyle = "#228be6";
        ctx.font = "bold 13px Inter, sans-serif";
        const label = `${srcW} x ${srcH}`;
        const textW = ctx.measureText(label).width;
        const labelX = rect.x + rect.w / 2 - textW / 2;
        const labelY = rect.y + rect.h + 20;

        ctx.fillStyle = "rgba(34, 139, 230, 0.9)";
        ctx.beginPath();
        ctx.roundRect(labelX - 6, labelY - 14, textW + 12, 22, 6);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.fillText(label, labelX, labelY);
      }
    },
    [scale, sourceWidth, sourceHeight]
  );

  // Redraw when selection or scale changes
  useEffect(() => {
    if (imageRef.current) {
      const rect = drawing && startPos && currentPos
        ? normalizeRect(startPos, currentPos)
        : selection;
      drawCanvas(imageRef.current, rect);
    }
  }, [selection, drawing, startPos, currentPos, scale, drawCanvas]);

  const getCanvasPos = (e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const normalizeRect = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): CropRect => {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    return { x, y, w, h };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    setDrawing(true);
    setStartPos(pos);
    setCurrentPos(pos);
    setSelection(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    setCurrentPos(getCanvasPos(e));
  };

  const handleMouseUp = () => {
    if (!drawing || !startPos || !currentPos) return;
    setDrawing(false);
    const rect = normalizeRect(startPos, currentPos);
    if (rect.w > 5 && rect.h > 5) {
      setSelection(rect);
    } else {
      setSelection(null);
    }
    setStartPos(null);
    setCurrentPos(null);
  };

  const handleConfirm = () => {
    if (!selection) return;
    // Convert display coordinates back to source image coordinates
    const srcRect: CropRect = {
      x: Math.round(selection.x / scale),
      y: Math.round(selection.y / scale),
      w: Math.round(selection.w / scale),
      h: Math.round(selection.h / scale),
    };
    onSelect(srcRect);
  };

  return (
    <Box ref={containerRef}>
      <Text size="sm" c="dimmed" mb="sm" ta="center">
        Click and drag to select a region
      </Text>
      <Box
        style={{
          display: "flex",
          justifyContent: "center",
          borderRadius: "var(--mantine-radius-md)",
          overflow: "hidden",
          border: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            cursor: "crosshair",
            display: "block",
            maxWidth: "100%",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </Box>
      <Group justify="center" mt="md" gap="sm">
        <Button
          radius="xl"
          onClick={handleConfirm}
          disabled={!selection}
          size="md"
        >
          Confirm Selection
        </Button>
        <Button
          radius="xl"
          variant="light"
          color="gray"
          onClick={() => {
            setSelection(null);
            if (imageRef.current) drawCanvas(imageRef.current, null);
          }}
          size="md"
          disabled={!selection}
        >
          Reset
        </Button>
        <Button radius="xl" variant="subtle" color="gray" onClick={onCancel} size="md">
          Cancel
        </Button>
      </Group>
    </Box>
  );
}
