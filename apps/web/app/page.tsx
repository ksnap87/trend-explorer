import { DomainTabs } from "@/components/DomainTabs";
import { TrendCard } from "@/components/TrendCard";
import { getTrends } from "@/lib/trends";
import { DOMAINS, DOMAIN_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

// Overview: 도메인별 상위 트렌드 몇 개씩 모아 보여준다.
export default async function OverviewPage() {
  const perDomain = await Promise.all(
    DOMAINS.map(async (d) => ({ domain: d, rows: (await getTrends(d, "week", 4)) })),
  );
  const hasAny = perDomain.some((g) => g.rows.length > 0);

  return (
    <main className="container">
      <DomainTabs />
      {!hasAny && (
        <div className="empty">
          아직 집계된 트렌드가 없습니다. 수집 → 분석 → 집계 파이프라인을 실행하세요.
        </div>
      )}
      {perDomain.map(
        (g) =>
          g.rows.length > 0 && (
            <section key={g.domain} style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16 }}>{DOMAIN_LABELS[g.domain]}</h2>
              <div className="grid">
                {g.rows.map((r) => (
                  <TrendCard key={r.id} row={r} />
                ))}
              </div>
            </section>
          ),
      )}
    </main>
  );
}
