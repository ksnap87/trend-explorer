import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Trend Explorer",
  description: "SNS 공개 게시물·브랜드 콘텐츠 기반 소비 트렌드 분석",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site">
          <h1>Trend Explorer</h1>
          <p>공식 API · Claude 분석 · 음식 / 패션 / 여행 / 라이프스타일 / 가전</p>
        </header>
        {children}
      </body>
    </html>
  );
}
