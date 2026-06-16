import { notFound } from "next/navigation";
import { DomainTabs } from "@/components/DomainTabs";
import { TrendCard } from "@/components/TrendCard";
import { getTrends } from "@/lib/trends";
import { DOMAINS, DOMAIN_LABELS, type Domain } from "@/lib/types";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return DOMAINS.map((domain) => ({ domain }));
}

export default async function DomainPage({
  params,
  searchParams,
}: {
  params: { domain: string };
  searchParams: { window?: string };
}) {
  const domain = params.domain as Domain;
  if (!DOMAINS.includes(domain)) notFound();

  const window = searchParams.window === "day" ? "day" : "week";
  const rows = await getTrends(domain, window, 24);

  return (
    <main className="container">
      <DomainTabs active={domain} />
      <div className="window-toggle">
        <a href={`?window=day`} className={`tab ${window === "day" ? "active" : ""}`}>
          일간
        </a>
        <a href={`?window=week`} className={`tab ${window === "week" ? "active" : ""}`}>
          주간
        </a>
      </div>
      <h2 style={{ fontSize: 18 }}>{DOMAIN_LABELS[domain]} 트렌드</h2>
      {rows.length === 0 ? (
        <div className="empty">집계된 트렌드가 없습니다.</div>
      ) : (
        <div className="grid">
          {rows.map((r) => (
            <TrendCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </main>
  );
}
