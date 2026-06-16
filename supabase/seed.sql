-- Phase 1 시드: YouTube + 음식 도메인
-- 공개 브랜드/크리에이터 채널과 키워드. external_id(channelId)는 운영 시 채워 넣는다.
-- (channelId 없이도 yt-connector가 handle/keyword 검색으로 동작하도록 설계)

insert into sources (platform, kind, handle, domains, consent_status) values
  ('youtube', 'keyword', 'korean street food',     array['food'], 'keyword'),
  ('youtube', 'keyword', 'home cafe recipe',        array['food'], 'keyword'),
  ('youtube', 'keyword', 'air fryer recipe',        array['food','home_appliance'], 'keyword'),
  ('youtube', 'brand',   'tasty',                   array['food'], 'brand_public'),
  ('youtube', 'creator', 'maangchi',                array['food'], 'creator_optin')
on conflict (platform, kind, handle) do nothing;
