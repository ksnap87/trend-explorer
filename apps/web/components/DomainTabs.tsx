import Link from "next/link";
import { DOMAINS, DOMAIN_LABELS, type Domain } from "@/lib/types";

export function DomainTabs({ active }: { active?: Domain }) {
  return (
    <nav className="tabs">
      <Link href="/" className={`tab ${!active ? "active" : ""}`}>
        전체
      </Link>
      {DOMAINS.map((d) => (
        <Link key={d} href={`/domains/${d}`} className={`tab ${active === d ? "active" : ""}`}>
          {DOMAIN_LABELS[d]}
        </Link>
      ))}
    </nav>
  );
}
