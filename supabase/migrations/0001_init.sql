-- Trend Explorer — initial schema
-- 수집(ingest) → 분석(analyze) → 집계(aggregate) → 제공(serve) 파이프라인의 핵심 테이블.
--
-- 합법성/프라이버시 원칙:
--   * 공식 API만 사용 (스크래핑 없음)
--   * sources.consent_status 로 브랜드/동의 계정만 활성화
--   * 개인 프로파일링 금지 — 트렌드는 tags_dim / trend_aggregates 수준으로만 노출

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- sources: 모니터링 대상 (브랜드/크리에이터 계정, 해시태그, 키워드)
-- ---------------------------------------------------------------------------
create table if not exists sources (
  id             uuid primary key default gen_random_uuid(),
  platform       text not null check (platform in ('youtube', 'instagram', 'x')),
  kind           text not null check (kind in ('brand', 'creator', 'hashtag', 'keyword')),
  handle         text not null,                 -- 계정 핸들 / 해시태그 / 검색어
  external_id    text,                          -- 플랫폼 계정 id (yt channelId 등)
  domains        text[] not null default '{}',  -- 기대 도메인 힌트 (food/fashion/...)
  consent_status text not null default 'keyword'
                 check (consent_status in ('brand_public', 'creator_optin', 'keyword')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (platform, kind, handle)
);

-- ---------------------------------------------------------------------------
-- ingestion_jobs / analysis_jobs: Postgres 기반 작업 큐
--   워커는 'queued' 행을 FOR UPDATE SKIP LOCKED 로 클레임한다.
-- ---------------------------------------------------------------------------
create table if not exists ingestion_jobs (
  id            bigint generated always as identity primary key,
  source_id     uuid references sources(id) on delete cascade,
  platform      text not null,
  status        text not null default 'queued'
                check (status in ('queued', 'running', 'done', 'error')),
  cursor        text,                           -- 페이지네이션 토큰 / since_id
  attempts      int not null default 0,
  last_error    text,
  scheduled_for timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
create index if not exists ingestion_jobs_claim_idx
  on ingestion_jobs (status, scheduled_for);

create table if not exists analysis_jobs (
  id            bigint generated always as identity primary key,
  post_id       uuid not null,                  -- raw_posts.id (FK는 아래에서 추가)
  status        text not null default 'queued'
                check (status in ('queued', 'running', 'done', 'error')),
  attempts      int not null default 0,
  last_error    text,
  scheduled_for timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
create index if not exists analysis_jobs_claim_idx
  on analysis_jobs (status, scheduled_for);

-- ---------------------------------------------------------------------------
-- raw_posts: 정규화된 게시물 (플랫폼 원본은 raw jsonb 에 보존)
-- ---------------------------------------------------------------------------
create table if not exists raw_posts (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid references sources(id) on delete set null,
  platform         text not null,
  platform_post_id text not null,
  author_external_id text,
  url              text,
  caption          text,
  lang             text,
  posted_at        timestamptz,
  metrics          jsonb not null default '{}'::jsonb,  -- likes/comments/views/...
  raw              jsonb,                               -- 원본 API 페이로드 (감사/재처리)
  fetched_at       timestamptz not null default now(),
  unique (platform, platform_post_id)
);
create index if not exists raw_posts_posted_at_idx on raw_posts (posted_at);

alter table analysis_jobs
  add constraint analysis_jobs_post_fk
  foreign key (post_id) references raw_posts(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- media: 게시물 이미지/썸네일
-- ---------------------------------------------------------------------------
create table if not exists media (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references raw_posts(id) on delete cascade,
  type         text not null check (type in ('image', 'video_thumbnail')),
  source_url   text not null,
  storage_path text,                            -- Supabase Storage 캐시본 (선택)
  width        int,
  height       int,
  -- 커넥터 재실행 시 같은 미디어가 중복 insert 되지 않도록 자연키 unique.
  unique (post_id, source_url)
);
create index if not exists media_post_idx on media (post_id);

-- ---------------------------------------------------------------------------
-- tags_dim: 정규 태그 사전 (동의어 dedupe)
-- ---------------------------------------------------------------------------
create table if not exists tags_dim (
  id        uuid primary key default gen_random_uuid(),
  canonical text not null,
  domain    text not null,
  aliases   text[] not null default '{}',
  unique (domain, canonical)
);

-- ---------------------------------------------------------------------------
-- post_analysis: Claude 출력 (포스트 × 모델 당 1행)
-- ---------------------------------------------------------------------------
create table if not exists post_analysis (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references raw_posts(id) on delete cascade,
  model        text not null,
  domain       text not null,                   -- 주 도메인 분류
  tags         jsonb not null default '[]'::jsonb,   -- [{tag,type,confidence}]
  entities     jsonb not null default '[]'::jsonb,   -- [{name,kind}]
  sentiment    text check (sentiment in ('positive', 'neutral', 'negative')),
  themes       jsonb not null default '[]'::jsonb,
  is_ad_or_promo boolean,
  raw_response jsonb,
  analyzed_at  timestamptz not null default now(),
  unique (post_id, model)                       -- 재분석 방지
);
create index if not exists post_analysis_domain_idx on post_analysis (domain);

-- ---------------------------------------------------------------------------
-- trend_aggregates: 대시보드가 읽는 최종 산출물
--   trend = 한 도메인/시간창에서 높고(상위) 상승하며(momentum) 복수 출처(distinct_sources>=2)
-- ---------------------------------------------------------------------------
create table if not exists trend_aggregates (
  id                  uuid primary key default gen_random_uuid(),
  tag_id              uuid not null references tags_dim(id) on delete cascade,
  domain              text not null,
  platform            text not null default 'all',   -- 'youtube' | 'all' | ...
  window              text not null check (window in ('day', 'week')),
  window_start        date not null,
  post_count          int not null default 0,
  engagement_sum      bigint not null default 0,
  distinct_sources    int not null default 0,
  sentiment_breakdown jsonb not null default '{}'::jsonb,
  score               numeric not null default 0,
  prev_score          numeric,
  computed_at         timestamptz not null default now(),
  unique (tag_id, domain, platform, window, window_start)
);
create index if not exists trend_aggregates_lookup_idx
  on trend_aggregates (domain, platform, window, window_start);

-- ---------------------------------------------------------------------------
-- trend_config: 점수 가중치 (재배포 없이 튜닝)
-- ---------------------------------------------------------------------------
create table if not exists trend_config (
  key   text primary key,
  value numeric not null
);
insert into trend_config (key, value) values
  ('w_post_count',     1.0),
  ('w_engagement',     0.5),
  ('w_distinct',       2.0),
  ('w_momentum',       3.0),
  ('momentum_k',       5.0),
  ('min_distinct',     2.0)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: 대시보드는 trend_aggregates / tags_dim 만 read-only.
--      나머지는 service role (Edge Function) 전용 → RLS 켜되 정책 미부여.
-- ---------------------------------------------------------------------------
alter table sources          enable row level security;
alter table ingestion_jobs   enable row level security;
alter table analysis_jobs    enable row level security;
alter table raw_posts        enable row level security;
alter table media            enable row level security;
alter table post_analysis    enable row level security;
alter table tags_dim         enable row level security;
alter table trend_aggregates enable row level security;
alter table trend_config     enable row level security;

create policy "public read trend_aggregates"
  on trend_aggregates for select using (true);
create policy "public read tags_dim"
  on tags_dim for select using (true);

-- 대시보드 샘플 포스트 표시를 위한 읽기 (캡션/URL/메트릭 — 집계 맥락).
create policy "public read raw_posts"
  on raw_posts for select using (true);
create policy "public read media"
  on media for select using (true);
