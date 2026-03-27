export interface TweetData {
  id: string;
  text: string;
  user: {
    name: string;
    screen_name: string;
    profile_image_url: string;
    is_blue_verified: boolean;
  };
  created_at: string;
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  views_count: string;
  media_url?: string;
  quoted_tweet?: TweetData;
  poll?: {
    options: { label: string; votes: number }[];
    total_votes: number;
  };
}

export interface VideoVariant {
  bitrate?: number;
  content_type: string;
  url: string;
}

export interface VideoData {
  thumbnail: string;
  variants: VideoVariant[];
  duration_ms?: number;
}

export function extractTweetId(url: string): string | null {
  const patterns = [
    /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
    /(?:twitter\.com|x\.com)\/i\/web\/status\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function isValidTweetUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(
    url
  );
}

export function formatCount(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return num.toString();
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function getQualityLabel(bitrate?: number): string {
  if (!bitrate) return "Audio Only";
  if (bitrate >= 2000000) return "1080p";
  if (bitrate >= 800000) return "720p";
  if (bitrate >= 300000) return "480p";
  return "360p";
}

// Fetch tweet data via the syndication/embed API
export async function fetchTweetData(tweetId: string): Promise<TweetData> {
  // Try the syndication endpoint first
  const resp = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=0`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 60 },
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch tweet: ${resp.status}`);
  }

  const data = await resp.json();

  const tweet: TweetData = {
    id: data.id_str || tweetId,
    text: data.text || "",
    user: {
      name: data.user?.name || "Unknown",
      screen_name: data.user?.screen_name || "unknown",
      profile_image_url:
        data.user?.profile_image_url_https?.replace("_normal", "_400x400") ||
        "",
      is_blue_verified: data.user?.is_blue_verified || false,
    },
    created_at: data.created_at || new Date().toISOString(),
    favorite_count: data.favorite_count || 0,
    retweet_count: data.retweet_count || 0,
    reply_count: data.reply_count || 0,
    views_count: data.views_count || "0",
  };

  // Extract media
  if (data.mediaDetails?.[0]) {
    const media = data.mediaDetails[0];
    tweet.media_url = media.media_url_https;
  }

  // Extract quoted tweet
  if (data.quoted_tweet) {
    tweet.quoted_tweet = {
      id: data.quoted_tweet.id_str,
      text: data.quoted_tweet.text || "",
      user: {
        name: data.quoted_tweet.user?.name || "",
        screen_name: data.quoted_tweet.user?.screen_name || "",
        profile_image_url:
          data.quoted_tweet.user?.profile_image_url_https?.replace(
            "_normal",
            "_400x400"
          ) || "",
        is_blue_verified:
          data.quoted_tweet.user?.is_blue_verified || false,
      },
      created_at: data.quoted_tweet.created_at || "",
      favorite_count: data.quoted_tweet.favorite_count || 0,
      retweet_count: data.quoted_tweet.retweet_count || 0,
      reply_count: data.quoted_tweet.reply_count || 0,
      views_count: data.quoted_tweet.views_count || "0",
    };
  }

  return tweet;
}

// Extract video data from tweet
export async function fetchVideoData(tweetId: string): Promise<VideoData | null> {
  const resp = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=0`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 60 },
    }
  );

  if (!resp.ok) return null;

  const data = await resp.json();

  const videoMedia = data.mediaDetails?.find(
    (m: { type: string }) => m.type === "video" || m.type === "animated_gif"
  );

  if (!videoMedia?.video_info?.variants) return null;

  return {
    thumbnail: videoMedia.media_url_https || "",
    variants: videoMedia.video_info.variants.filter(
      (v: VideoVariant) => v.content_type === "video/mp4"
    ),
    duration_ms: videoMedia.video_info.duration_millis,
  };
}
