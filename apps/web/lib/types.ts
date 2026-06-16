export const DOMAINS = [
  "food",
  "fashion",
  "travel",
  "lifestyle",
  "home_appliance",
] as const;

export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_LABELS: Record<Domain, string> = {
  food: "음식",
  fashion: "패션",
  travel: "여행",
  lifestyle: "라이프스타일",
  home_appliance: "가전",
};

export interface SentimentBreakdown {
  positive?: number;
  neutral?: number;
  negative?: number;
}

// trend_aggregates + tags_dim 조인 결과.
export interface TrendRow {
  id: string;
  tag_id: string;
  domain: Domain;
  platform: string;
  window: "day" | "week";
  window_start: string;
  post_count: number;
  engagement_sum: number;
  distinct_sources: number;
  sentiment_breakdown: SentimentBreakdown;
  score: number;
  prev_score: number | null;
  tags_dim: { canonical: string } | null;
}
