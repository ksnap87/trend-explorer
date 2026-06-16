// analysis-worker: queued analysis_jobs 를 클레임해 Claude 로 포스트를 분석하고
// post_analysis 에 구조화 결과를 기록한다.
//
// Phase 1 은 동기 단건 호출. 동작 검증 후 Batches API(50% 할인)로 전환한다.
import { serviceClient, jsonResponse } from "../_shared/db.ts";
import { analyzePost, DEFAULT_MODEL } from "../_shared/anthropic.ts";

const BATCH_SIZE = 5;       // 호출당 처리 작업 수 (쿼터/타임아웃 보호)
const MAX_ATTEMPTS = 3;

Deno.serve(async () => {
  const db = serviceClient();

  // 'queued' 작업을 클레임. RPC 가 없는 환경을 위해 select→update 로 처리.
  const { data: jobs, error } = await db
    .from("analysis_jobs")
    .select("id, post_id, attempts")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) return jsonResponse({ error: error.message }, 500);

  let analyzed = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    await db.from("analysis_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job.id);

    try {
      const { data: post } = await db
        .from("raw_posts")
        .select("id, caption, media(source_url, type)")
        .eq("id", job.post_id)
        .single();
      if (!post) throw new Error("raw_posts 행 없음");

      const imageUrl = (post.media as { source_url: string }[] | null)?.[0]?.source_url;
      const result = await analyzePost({ caption: post.caption ?? undefined, imageUrl });

      await db.from("post_analysis").upsert(
        {
          post_id: post.id,
          model: DEFAULT_MODEL,
          domain: result.domain,
          tags: result.tags,
          entities: result.entities,
          sentiment: result.sentiment,
          themes: result.themes,
          is_ad_or_promo: result.is_ad_or_promo,
          analyzed_at: new Date().toISOString(),
        },
        { onConflict: "post_id,model" },
      );

      await db.from("analysis_jobs")
        .update({ status: "done", finished_at: new Date().toISOString() })
        .eq("id", job.id);
      analyzed++;
    } catch (e) {
      failed++;
      const attempts = (job.attempts ?? 0) + 1;
      await db.from("analysis_jobs").update({
        status: attempts >= MAX_ATTEMPTS ? "error" : "queued",
        attempts,
        last_error: (e as Error).message,
        // 지수 백오프 재시도.
        scheduled_for: new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
      }).eq("id", job.id);
    }
  }

  return jsonResponse({ analyzed, failed, claimed: jobs?.length ?? 0 });
});
