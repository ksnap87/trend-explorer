-- 트렌드 집계 함수.
-- post_analysis 의 태그를 정규화(tags_dim)하고, 주어진 시간창으로 롤업해
-- trend_config 가중치로 점수를 계산, trend_aggregates 에 upsert 한다.
--
-- trend 정의: 한 도메인/시간창에서 (a) 높고 (b) 상승(momentum)하며
--             (c) 복수 출처(distinct_sources >= min_distinct).

create or replace function rebuild_trend_aggregates(p_window text, p_window_start date)
returns int
language plpgsql
as $$
declare
  v_interval interval := case when p_window = 'week' then interval '7 days' else interval '1 day' end;
  v_start timestamptz := p_window_start::timestamptz;
  v_end   timestamptz := p_window_start::timestamptz + v_interval;
  w_post numeric;
  w_eng  numeric;
  w_dist numeric;
  w_mom  numeric;
  k_mom  numeric;
  v_count int;
begin
  select value into w_post from trend_config where key = 'w_post_count';
  select value into w_eng  from trend_config where key = 'w_engagement';
  select value into w_dist from trend_config where key = 'w_distinct';
  select value into w_mom  from trend_config where key = 'w_momentum';
  select value into k_mom  from trend_config where key = 'momentum_k';

  -- 1) 태그 정규화: 윈도 내 등장 태그를 tags_dim 에 보장(canonical = lower(tag)).
  insert into tags_dim (canonical, domain)
  select distinct lower(trim(t->>'tag')) as canonical, pa.domain
  from post_analysis pa
  join raw_posts rp on rp.id = pa.post_id
  cross join lateral jsonb_array_elements(pa.tags) as t
  where rp.posted_at >= v_start and rp.posted_at < v_end
    and coalesce(trim(t->>'tag'), '') <> ''
  on conflict (domain, canonical) do nothing;

  -- 2) 윈도별 tag×domain 집계 → 점수 계산 → upsert.
  with mentions as (
    select
      td.id as tag_id,
      pa.domain,
      rp.source_id,
      pa.sentiment,
      coalesce((rp.metrics->>'likeCount')::bigint, 0)
        + coalesce((rp.metrics->>'commentCount')::bigint, 0)
        + coalesce((rp.metrics->>'viewCount')::bigint, 0) / 100 as engagement
    from post_analysis pa
    join raw_posts rp on rp.id = pa.post_id
    cross join lateral jsonb_array_elements(pa.tags) as t
    join tags_dim td on td.canonical = lower(trim(t->>'tag')) and td.domain = pa.domain
    where rp.posted_at >= v_start and rp.posted_at < v_end
  ),
  agg as (
    select
      tag_id,
      domain,
      count(*)::int as post_count,
      sum(engagement)::bigint as engagement_sum,
      count(distinct source_id)::int as distinct_sources,
      jsonb_build_object(
        'positive', count(*) filter (where sentiment = 'positive'),
        'neutral',  count(*) filter (where sentiment = 'neutral'),
        'negative', count(*) filter (where sentiment = 'negative')
      ) as sentiment_breakdown
    from mentions
    group by tag_id, domain
  ),
  scored as (
    select
      a.*,
      (w_post * ln(1 + a.post_count)
       + w_eng  * ln(1 + a.engagement_sum)
       + w_dist * a.distinct_sources) as base_score,
      prev.score as prev_score
    from agg a
    left join trend_aggregates prev
      on prev.tag_id = a.tag_id and prev.domain = a.domain
     and prev.platform = 'all' and prev.window = p_window
     and prev.window_start = (p_window_start - v_interval::interval)::date
  )
  insert into trend_aggregates (
    tag_id, domain, platform, window, window_start,
    post_count, engagement_sum, distinct_sources, sentiment_breakdown,
    score, prev_score, computed_at
  )
  select
    tag_id, domain, 'all', p_window, p_window_start,
    post_count, engagement_sum, distinct_sources, sentiment_breakdown,
    base_score
      + w_mom * ((base_score - coalesce(prev_score, 0)) / (coalesce(prev_score, 0) + k_mom)),
    prev_score, now()
  from scored
  on conflict (tag_id, domain, platform, window, window_start) do update set
    post_count = excluded.post_count,
    engagement_sum = excluded.engagement_sum,
    distinct_sources = excluded.distinct_sources,
    sentiment_breakdown = excluded.sentiment_breakdown,
    score = excluded.score,
    prev_score = excluded.prev_score,
    computed_at = excluded.computed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
