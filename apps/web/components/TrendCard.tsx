import type { TrendRow } from "@/lib/types";
import { SentimentBar } from "./SentimentBar";

function momentum(row: TrendRow): { label: string; cls: string } | null {
  if (row.prev_score == null) return null;
  const delta = row.score - row.prev_score;
  if (Math.abs(delta) < 0.01) return null;
  const up = delta > 0;
  return {
    label: `${up ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}`,
    cls: up ? "delta-up" : "delta-down",
  };
}

export function TrendCard({ row }: { row: TrendRow }) {
  const mom = momentum(row);
  return (
    <div className="card">
      <div className="tag">{row.tags_dim?.canonical ?? "—"}</div>
      <div className="meta">
        게시물 {row.post_count} · 출처 {row.distinct_sources} · 참여 {row.engagement_sum.toLocaleString()}
      </div>
      <div className="score">
        점수 {row.score.toFixed(1)}
        {mom && <span className={mom.cls}> {mom.label}</span>}
      </div>
      <SentimentBar data={row.sentiment_breakdown} />
    </div>
  );
}
