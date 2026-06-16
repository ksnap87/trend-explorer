import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 대시보드는 anon 키로 RLS read-only 정책을 통해 trend_aggregates 등만 읽는다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured = Boolean(url && anonKey);

// env 미설정 시(빌드/프리뷰) createClient 가 throw 하지 않도록 지연 생성한다.
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;
