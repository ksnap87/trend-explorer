import type { SentimentBreakdown } from "@/lib/types";

export function SentimentBar({ data }: { data: SentimentBreakdown }) {
  const pos = data.positive ?? 0;
  const neu = data.neutral ?? 0;
  const neg = data.negative ?? 0;
  const total = pos + neu + neg;
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="sentiment" title={`긍정 ${pos} · 중립 ${neu} · 부정 ${neg}`}>
      <span style={{ width: pct(pos), background: "var(--pos)" }} />
      <span style={{ width: pct(neu), background: "var(--neu)" }} />
      <span style={{ width: pct(neg), background: "var(--neg)" }} />
    </div>
  );
}
