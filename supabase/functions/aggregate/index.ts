// aggregate: 오늘 기준 day/week 윈도로 트렌드 집계를 다시 계산한다.
// rebuild_trend_aggregates() Postgres 함수를 호출 (집계 로직은 SQL 측에 위치).
import { serviceClient, jsonResponse } from "../_shared/db.ts";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// 주(week) 윈도 시작 = 해당 주의 월요일.
function weekStart(d: Date): string {
  const x = new Date(d);
  const day = (x.getUTCDay() + 6) % 7; // 0 = 월요일
  x.setUTCDate(x.getUTCDate() - day);
  return isoDate(x);
}

Deno.serve(async () => {
  const db = serviceClient();
  const now = new Date();
  const results: Record<string, unknown> = {};

  for (const [win, start] of [
    ["day", isoDate(now)],
    ["week", weekStart(now)],
  ] as const) {
    const { data, error } = await db.rpc("rebuild_trend_aggregates", {
      p_window: win,
      p_window_start: start,
    });
    results[`${win}:${start}`] = error ? { error: error.message } : { rows: data };
  }

  return jsonResponse(results);
});
