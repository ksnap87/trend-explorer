// 플랫폼 API 응답 → raw_posts / media 공통 형태로 정규화.
// Phase 1 은 YouTube 만 구현. 다른 플랫폼은 동일 NormalizedPost 형태로 추가한다.

export interface NormalizedMedia {
  type: "image" | "video_thumbnail";
  source_url: string;
  width?: number;
  height?: number;
}

export interface NormalizedPost {
  platform: "youtube" | "instagram" | "x";
  platform_post_id: string;
  author_external_id?: string;
  url?: string;
  caption?: string;
  lang?: string;
  posted_at?: string; // ISO
  metrics: Record<string, number>;
  media: NormalizedMedia[];
  raw: unknown;
}

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    title?: string;
    description?: string;
    defaultLanguage?: string;
    thumbnails?: Record<string, { url: string; width?: number; height?: number }>;
  };
}

// YouTube Data API v3 search/videos 응답 항목을 정규화.
// statsById: videos.list?part=statistics 로 받아온 videoId → 통계 맵 (선택).
export function normalizeYouTube(
  item: YouTubeSearchItem,
  statsById?: Record<string, Record<string, string>>,
): NormalizedPost | null {
  const videoId = item.id?.videoId;
  const snippet = item.snippet;
  if (!videoId || !snippet) return null;

  const thumb =
    snippet.thumbnails?.maxres ??
    snippet.thumbnails?.high ??
    snippet.thumbnails?.medium ??
    snippet.thumbnails?.default;

  const stats = statsById?.[videoId] ?? {};
  const metrics: Record<string, number> = {};
  for (const k of ["viewCount", "likeCount", "commentCount"]) {
    if (stats[k] != null) metrics[k] = Number(stats[k]);
  }

  return {
    platform: "youtube",
    platform_post_id: videoId,
    author_external_id: snippet.channelId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    caption: [snippet.title, snippet.description].filter(Boolean).join("\n\n"),
    lang: snippet.defaultLanguage,
    posted_at: snippet.publishedAt,
    metrics,
    media: thumb
      ? [{ type: "video_thumbnail", source_url: thumb.url, width: thumb.width, height: thumb.height }]
      : [],
    raw: item,
  };
}
