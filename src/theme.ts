import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "blue",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  defaultRadius: "lg",
  black: "#0f1419",
  colors: {
    dark: [
      "#C1C2C5",
      "#A6A7AB",
      "#909296",
      "#5c5f66",
      "#373A40",
      "#2C2E33",
      "#25262b",
      "#1A1B1E",
      "#141517",
      "#101113",
    ],
  },
  headings: {
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    fontWeight: "700",
  },
});
