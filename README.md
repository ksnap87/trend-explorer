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

## 원격 배포 (프로덕션 프로비저닝)

MCP 없이 Supabase CLI만으로 라이브 슬라이스를 세운다. `SUPABASE_ACCESS_TOKEN`(대시보드 →
Account → Access Tokens)과 프로젝트 ref가 필요하다.

```bash
# 0) CLI 로그인 + 프로젝트 연결 (없으면 supabase projects create 로 생성)
supabase login                                  # 또는 export SUPABASE_ACCESS_TOKEN=...
supabase link --project-ref <PROJECT_REF>

# 1) 스키마 적용: 0001_init.sql → 0002_aggregate.sql 순서로 원격 DB에 push
supabase db push

# 2) 시드 (seed.sql 은 db push 대상이 아니므로 명시적으로 실행)
#    - 방법 A: 대시보드 SQL Editor 에 supabase/seed.sql 내용을 붙여넣어 실행 (가장 간단)
#    - 방법 B: 연결 문자열(Settings → Database → Connection string)로 psql 실행
psql "<CONNECTION_STRING>" -f supabase/seed.sql

# 3) Edge Function 시크릿 등록 (서버 전용 키)
supabase secrets set \
  YOUTUBE_API_KEY=<...> \
  ANTHROPIC_API_KEY=<...>
#   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 배포된 함수에 자동 주입됨

# 4) Edge Functions 배포
supabase functions deploy yt-connector
supabase functions deploy analysis-worker
supabase functions deploy aggregate

# 5) 파이프라인 1회 통과 (수집 → 분석 → 집계)
supabase functions invoke yt-connector      # raw_posts/media 적재 + analysis_jobs enqueue
supabase functions invoke analysis-worker   # post_analysis 채움 (BATCH_SIZE=5, 필요 시 반복)
supabase functions invoke aggregate         # trend_aggregates day/week 롤업
```

집계 함수가 `rebuild_trend_aggregates(window, window_start)` 를 호출하는지 확인하고, 값이
비어 있으면 `select rebuild_trend_aggregates('week', date_trunc('week', now())::date);` 로
직접 실행해 sanity check 한다.

### 대시보드 (Netlify)

```bash
# anon 키 확인 (URL 은 https://<PROJECT_REF>.supabase.co)
supabase projects api-keys --project-ref <PROJECT_REF>
```

Netlify 사이트 환경변수에 아래를 설정하고 `apps/web` 을 배포한다:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://<PROJECT_REF>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = 위에서 확인한 `anon` 키 anon 키는 RLS read-only 정책(`trend_aggregates`, `tags_dim`,
`raw_posts`, `media`)으로만 접근하므로 클라이언트 노출이 안전하다.

## 검증 (end-to-end)

1. 마이그레이션 적용 후 `supabase` 테이블 목록에 모델 테이블이 존재
2. `yt-connector` 호출 → `raw_posts`/`media`에 시드 채널 영상 적재
3. `analysis-worker` 호출 → `post_analysis`에 구조화 JSON(domain/tags/sentiment)
4. `aggregate` 실행 → `trend_aggregates`에 day/week 행 (`distinct_sources >= 2` 필터)
5. 대시보드 음식 Domain 페이지에 트렌드 카드·샘플 포스트 렌더
