// Claude 추출 클라이언트. 이미지+텍스트를 받아 구조화된 트렌드 신호 JSON 을 반환한다.
// - 주 모델: claude-opus-4-8 (vision)
// - 고정 system 프롬프트는 prompt caching 으로 재사용 (cache_control)
// - 출력은 structured outputs(output_config.format)로 스키마 강제. Opus 4.8 은 prefill 미지원.
import {
  ANALYSIS_JSON_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  type Domain,
} from "./taxonomy.ts";

export const DEFAULT_MODEL = "claude-opus-4-8";

export interface ExtractionInput {
  caption?: string;
  imageUrl?: string;
}

export interface ExtractionResult {
  domain: Domain;
  tags: { tag: string; type: string; confidence: number }[];
  entities: { name: string; kind: string }[];
  sentiment: "positive" | "neutral" | "negative";
  themes: string[];
  is_ad_or_promo: boolean;
}

interface AnalyzeOptions {
  model?: string;
  apiKey?: string;
}

export async function analyzePost(
  input: ExtractionInput,
  opts: AnalyzeOptions = {},
): Promise<ExtractionResult> {
  const apiKey = opts.apiKey ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 가 설정되지 않았습니다.");
  const model = opts.model ?? DEFAULT_MODEL;

  const content: unknown[] = [];
  if (input.imageUrl) {
    content.push({ type: "image", source: { type: "url", url: input.imageUrl } });
  }
  content.push({
    type: "text",
    text: input.caption?.trim()
      ? `Analyze this post.\n\nCaption/title:\n${input.caption}`
      : "Analyze this post based on the image.",
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: EXTRACTION_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content }],
      output_config: {
        format: { type: "json_schema", schema: ANALYSIS_JSON_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  return JSON.parse(text) as ExtractionResult;
}
