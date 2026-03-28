# GrabIt - Multi-Platform Media Downloader

## Project Overview

A Next.js (App Router) web app for downloading media from Twitter/X and Instagram, plus a universal screenshot/metadata tool for any URL. Deployed on Vercel.

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **UI**: Mantine 8, Framer Motion, Embla Carousel
- **Instagram**: `instagram-url-direct` + HTML scraping fallback
- **Twitter**: Syndication API (unauthenticated)
- **Deployment**: Vercel (serverless Node.js functions)

## Architecture

### API Routes

| Route | Purpose |
|---|---|
| `/api/tweet` | Fetch tweet text, user info, engagement counts |
| `/api/video` | Extract video variants from tweets (multiple bitrates) |
| `/api/instagram` | Instagram post/reel/carousel extraction (2 fallback strategies) |
| `/api/screenshot` | Page metadata extraction (title, OG image, favicon) via Cheerio |
| `/api/download` | Proxy download from whitelisted CDNs (Twitter, Instagram) |

### Key Libraries

- `src/lib/platforms.ts` — Platform detection, URL normalization, shortcode extraction

### Frontend Components

- Tab-based UI: "Grab" (download) and "Snip" (screenshots)
- Platform auto-detection from pasted URL
- Platform-specific viewers: `tweet-card`, `instagram-viewer`
- Screenshot editor with region selection
- Dark/light theme toggle

## Important Design Decisions

### Vercel Compatibility

- Instagram extraction does NOT use yt-dlp. It relies on `instagram-url-direct` as primary, with HTML meta tag scraping as fallback.

### Twitter API

- Uses public syndication endpoint (`cdn.syndication.twimg.com`) — no API key required
- Video variants include multiple bitrate options

### Download Proxy

- `/api/download` whitelists specific CDN hosts (twimg.com, cdninstagram.com)
- Sets appropriate Referer headers per platform

## Working Features

- Twitter/X video download with quality selection
- Twitter tweet metadata display (text, user, engagement counts)
- Instagram post/reel/carousel download (images + videos)
- Universal page screenshot/metadata extraction
- Dark/light theme
- Platform auto-detection from URL
- CDN proxy for cross-origin media downloads

## Known Limitations & Potential Issues

- **Instagram extraction fragility**: `instagram-url-direct` can break when Instagram changes their page structure. HTML scraping fallback is also fragile. Private/deleted posts will fail.
- **Twitter syndication API**: Unauthenticated endpoint — may be rate-limited or deprecated by X/Twitter at any time. Only works for public tweets.

## Development

```bash
npm run dev    # Start dev server
npm run build  # Production build
npm run start  # Start production server
```
