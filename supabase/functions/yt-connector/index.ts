// yt-connector: 활성 YouTube source(채널/키워드)의 최근 영상을 공식 API 로 수집해
// raw_posts/media 에 upsert 하고, 신규 포스트마다 analysis_jobs 를 enqueue 한다.
//
// 공식 API 만 사용 (스크래핑 없음). YOUTUBE_API_KEY 필요.
import { serviceClient, jsonResponse } from "../_shared/db.ts";
import { normalizeYouTube, type NormalizedPost } from "../_shared/normalize.ts";

const YT_SEARCH = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";
const MAX_RESULTS = 10; // 쿼터 보호: source 당 최근 N개

async function searchVideos(
  source: { kind: string; handle: string; external_id: string | null },
  apiKey: string,
): Promise<NormalizedPost[]> {
  const params = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    type: "video",
    order: "date",
    maxResults: String(MAX_RESULTS),
  });
  // 채널이면 channelId 로, 아니면 키워드 검색.
  if (source.external_id) params.set("channelId", source.external_id);
  else params.set("q", source.handle);

  const sres = await fetch(`${YT_SEARCH}?${params}`);
  if (!sres.ok) throw new Error(`YouTube search ${sres.status}: ${await sres.text()}`);
  const sjson = await sres.json();
  const items: { id?: { videoId?: string } }[] = sjson.items ?? [];
  const ids = items.map((i) => i.id?.videoId).filter(Boolean) as string[];
  if (ids.length === 0) return [];

  // 통계(조회수/좋아요/댓글) 일괄 조회.
  const vparams = new URLSearchParams({ key: apiKey, part: "statistics", id: ids.join(",") });
  const vres = await fetch(`${YT_VIDEOS}?${vparams}`);
  const statsById: Record<string, Record<string, string>> = {};
  if (vres.ok) {
    const vjson = await vres.json();
    for (const v of vjson.items ?? []) statsById[v.id] = v.statistics ?? {};
  }

  return items
    .map((i) => normalizeYouTube(i, statsById))
    .filter((p): p is NormalizedPost => p !== null);
}

Deno.serve(async () => {
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) return jsonResponse({ error: "YOUTUBE_API_KEY 미설정" }, 500);

  const db = serviceClient();
  const { data: sources, error } = await db
    .from("sources")
    .select("id, kind, handle, external_id")
    .eq("platform", "youtube")
    .eq("is_active", true);
  if (error) return jsonResponse({ error: error.message }, 500);

  let ingested = 0;
  let enqueued = 0;
  const errors: string[] = [];

  for (const source of sources ?? []) {
    try {
      const posts = await searchVideos(source, apiKey);
      for (const post of posts) {
        const { data: row, error: upErr } = await db
          .from("raw_posts")
          .upsert(
            {
              source_id: source.id,
              platform: post.platform,
              platform_post_id: post.platform_post_id,
              author_external_id: post.author_external_id,
              url: post.url,
              caption: post.caption,
              lang: post.lang,
              posted_at: post.posted_at,
              metrics: post.metrics,
              raw: post.raw,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: "platform,platform_post_id", ignoreDuplicates: false },
          )
          .select("id")
          .single();
        if (upErr || !row) {
          errors.push(`upsert ${post.platform_post_id}: ${upErr?.message}`);
          continue;
        }
        ingested++;

        if (post.media.length > 0) {
          await db.from("media").upsert(
            post.media.map((m) => ({ post_id: row.id, ...m })),
            { onConflict: "post_id,source_url", ignoreDuplicates: true },
          );
        }

        // 아직 분석되지 않은 포스트만 enqueue.
        const { count } = await db
          .from("post_analysis")
          .select("id", { count: "exact", head: true })
          .eq("post_id", row.id);
        if (!count) {
          await db.from("analysis_jobs").insert({ post_id: row.id });
          enqueued++;
        }
      }
    } catch (e) {
      errors.push(`source ${source.handle}: ${(e as Error).message}`);
    }
  }

  return jsonResponse({ ingested, enqueued, errors });
});
