# GrabIt - Multi-Platform Media Downloader

## Project Overview

A Next.js (App Router) web app for downloading media from Twitter/X, Instagram, and YouTube, plus a universal screenshot/metadata tool for any URL. Deployed on Vercel.

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **UI**: Mantine 8, Framer Motion, Embla Carousel
- **YouTube**: `youtubei.js` (pure Node.js — reverse-engineered InnerTube API, no Python)
- **Instagram**: `instagram-url-direct` + HTML scraping fallback
- **Twitter**: Syndication API (unauthenticated)
- **Video muxing**: `ffmpeg-static` (compiled binary, works on Vercel)
- **Deployment**: Vercel (serverless Node.js functions)

## Architecture

### API Routes

| Route | Purpose |
|---|---|
| `/api/tweet` | Fetch tweet text, user info, engagement counts |
| `/api/video` | Extract video variants from tweets (multiple bitrates) |
| `/api/instagram` | Instagram post/reel/carousel extraction (2 fallback strategies) |
| `/api/youtube` | YouTube video metadata + format list via youtubei.js |
| `/api/youtube/download` | YouTube video download with optional ffmpeg muxing |
| `/api/youtube/thumbnail` | Verify and return YouTube thumbnails |
| `/api/screenshot` | Page metadata extraction (title, OG image, favicon) via Cheerio |
| `/api/download` | Proxy download from whitelisted CDNs (Twitter, Instagram, YouTube) |

### Key Libraries

- `src/lib/innertube.ts` — YouTube data fetching via youtubei.js (Innertube API), URL deciphering, format resolution
- `src/lib/platforms.ts` — Platform detection, URL normalization, shortcode extraction
- `src/lib/youtube.ts` — YouTube format normalization, filename building
- `src/lib/youtube-browser.ts` — Client-side download helpers (blob save, direct link)

### Frontend Components

- Tab-based UI: "Grab" (download) and "Create" (screenshots)
- Platform auto-detection from pasted URL
- Platform-specific viewers: `tweet-card`, `instagram-viewer`, `youtube-viewer`
- Quality/format selector for YouTube (muxed vs video-only)
- Screenshot editor with region selection
- Dark/light theme toggle

## Important Design Decisions

### Vercel Compatibility

- YouTube extraction uses `youtubei.js` (pure Node.js, InnerTube API) instead of `yt-dlp` (Python binary). This was changed because Vercel's serverless runtime does not have Python installed. The ANDROID client is used for format retrieval as it returns the most formats with working URLs.
- A custom JavaScript evaluator (`Platform.shim.eval`) is configured in `innertube.ts` for URL signature deciphering — required by youtubei.js v17+.
- `ffmpeg-static` provides a compiled Linux binary that works on Vercel for muxing video+audio streams. It's included via `outputFileTracingIncludes` in `next.config.ts`.
- Instagram extraction does NOT use yt-dlp. It relies on `instagram-url-direct` as primary, with HTML meta tag scraping as fallback.

### YouTube Download Flow

- **Muxed formats** (has audio+video, typically 360p only): downloaded directly
- **Non-muxed formats** (video-only, up to 4K): video and audio fetched separately via deciphered URLs, merged with ffmpeg, streamed to client
- If ffmpeg is unavailable: falls back to video-only download (no audio)

### Twitter API

- Uses public syndication endpoint (`cdn.syndication.twimg.com`) — no API key required
- Video variants include multiple bitrate options

### Download Proxy

- `/api/download` whitelists specific CDN hosts (twimg.com, cdninstagram.com, googlevideo.com, etc.)
- Sets appropriate Referer headers per platform

## Working Features

- Twitter/X video download with quality selection
- Twitter tweet metadata display (text, user, engagement counts)
- Instagram post/reel/carousel download (images + videos)
- YouTube video info extraction with all available formats
- YouTube video download (muxed and non-muxed with ffmpeg merge)
- YouTube thumbnail download
- Universal page screenshot/metadata extraction
- Dark/light theme
- Platform auto-detection from URL
- CDN proxy for cross-origin media downloads

## Known Limitations & Potential Issues

- **Instagram extraction fragility**: `instagram-url-direct` can break when Instagram changes their page structure. HTML scraping fallback is also fragile. Private/deleted posts will fail.
- **YouTube bot detection**: YouTube may block requests from Vercel IPs (shared serverless infra). Users may see "YouTube blocked this request" errors. No cookie/auth support currently.
- **Twitter syndication API**: Unauthenticated endpoint — may be rate-limited or deprecated by X/Twitter at any time. Only works for public tweets.
- **Large YouTube videos**: Download timeout is 300s (`maxDuration`). Very long videos may time out on Vercel's free tier.
- **No YouTube playlist support**: Single video only (--no-playlist equivalent).
- **ffmpeg-static on Vercel**: The binary is ~70MB — increases function bundle size. If Vercel changes bundling limits, this may break.

## Development

```bash
npm run dev    # Start dev server
npm run build  # Production build
npm run start  # Start production server
```
