# Trend Explorer

공식 SNS API에서 공개 게시물과 마켓리딩 브랜드 콘텐츠를 수집해 **음식 · 패션 · 여행 ·
라이프스타일 · 가전** 분야의 소비 트렌드를 분석하고 웹 대시보드로 보여주는 프로젝트입니다.

분석은 Claude(vision+text)로 게시물의 이미지와 글을 함께 읽어 구조화된 태그/테마/감성을
뽑아내고, 시간창별로 집계해 "떠오르는 트렌드"를 점수화합니다.

> 합법성 원칙: **공식 API만** 사용하며(스크래핑 없음), 개인 프로파일링을 하지 않고
> 브랜드·동의 기반 비즈니스 계정과 키워드/해시태그 중심으로 **집계·익명화된 트렌드**만 저장·노출합니다.

## 아키텍처

```
pg_cron → ingestion_jobs → [yt-connector]  (공식 API: 시드 채널 + 키워드)
   → normalize → raw_posts + media (Postgres + Storage)
   → analysis_jobs → [analysis-worker]  (Claude vision+text → 구조화 JSON)
   → post_analysis → [aggregate]  (태그 → 시간창별 트렌드 점수)
   → trend_aggregates → Next.js 대시보드 (Netlify, RLS read-only)
```

단계: **수집(ingest) → 분석(analyze) → 집계(aggregate) → 제공(serve)**.
수집·분석은 Supabase Edge Function에서 백그라운드로 동작하고, Claude/플랫폼 API 키는
서버 측에만 둡니다.

## 저장소 구조

```
trend-explorer/
├─ apps/web/                      # Next.js 대시보드 (Netlify)
├─ supabase/
│  ├─ migrations/0001_init.sql            # 데이터 모델
│  ├─ functions/yt-connector/             # YouTube 수집
│  ├─ functions/analysis-worker/          # Claude 추출
│  ├─ functions/aggregate/                # trend_aggregates 롤업
│  └─ functions/_shared/                  # 공용 (anthropic, normalize, taxonomy, db)
├─ packages/shared-types/                 # 도메인 taxonomy + 공용 타입
├─ netlify.toml
└─ README.md
```

## Phase 1 범위

가장 얇은 end-to-end 슬라이스: **YouTube + 음식 도메인**.

1. Supabase 테이블 생성 (`supabase/migrations/0001_init.sql`)
2. 음식 분야 공개 채널/키워드 시드 (`supabase/seed.sql`)
3. `yt-connector` — YouTube Data API v3로 수집 → `raw_posts`/`media`
4. `analysis-worker` — `claude-opus-4-8`로 썸네일+텍스트 분석 → `post_analysis`
5. `aggregate` — day/week 트렌드 점수 → `trend_aggregates`
6. Next.js 음식 Domain 페이지가 `trend_aggregates` 렌더

## 환경 변수

| 변수 | 설명 | 사용처 |
|---|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL | web, functions |
| `SUPABASE_SERVICE_ROLE_KEY` | service role 키 (서버 전용) | functions |
| `NEXT_PUBLIC_SUPABASE_URL` | 클라이언트용 URL | web |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트용 anon 키 | web |
| `ANTHROPIC_API_KEY` | Claude API 키 | analysis-worker |
| `YOUTUBE_API_KEY` | YouTube Data API v3 키 | yt-connector |

Edge Function 시크릿은 `supabase secrets set` 으로 등록합니다.

## 로컬 개발

```bash
# 1) DB 마이그레이션
supabase start
supabase db reset            # 0001_init.sql + seed.sql 적용

# 2) Edge Functions
supabase functions serve

# 3) 대시보드
cd apps/web
npm install
npm run dev
```

## 검증 (end-to-end)

1. 마이그레이션 적용 후 `supabase` 테이블 목록에 모델 테이블이 존재
2. `yt-connector` 호출 → `raw_posts`/`media`에 시드 채널 영상 적재
3. `analysis-worker` 호출 → `post_analysis`에 구조화 JSON(domain/tags/sentiment)
4. `aggregate` 실행 → `trend_aggregates`에 day/week 행 (`distinct_sources >= 2` 필터)
5. 대시보드 음식 Domain 페이지에 트렌드 카드·샘플 포스트 렌더
