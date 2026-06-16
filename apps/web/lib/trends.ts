import { supabase, isConfigured } from "./supabaseClient";
import type { Domain, TrendRow } from "./types";

// 한 도메인의 트렌드를 점수순으로 조회. min_distinct 필터는 RPC/뷰 대신 여기서 보수적 적용.
export async function getTrends(
  domain: Domain,
  window: "day" | "week" = "week",
  limit = 24,
): Promise<TrendRow[]> {
  if (!isConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("trend_aggregates")
    .select(
      "id, tag_id, domain, platform, window, window_start, post_count, engagement_sum, distinct_sources, sentiment_breakdown, score, prev_score, tags_dim(canonical)",
    )
    .eq("domain", domain)
    .eq("platform", "all")
    .eq("window", window)
    .gte("distinct_sources", 2)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getTrends", error.message);
    return [];
  }
  return (data ?? []) as unknown as TrendRow[];
}
