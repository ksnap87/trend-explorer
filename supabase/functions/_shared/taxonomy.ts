// 도메인 분류 체계 — analysis-worker 의 system 프롬프트에서 사용한다.
// 이 프롬프트는 모든 게시물에서 동일(고정)하므로 prompt caching 으로 비용을 절감한다.

export const DOMAINS = [
  "food",
  "fashion",
  "travel",
  "lifestyle",
  "home_appliance",
  "other",
] as const;

export type Domain = (typeof DOMAINS)[number];

export const TAG_TYPES = [
  "concept",
  "style",
  "ingredient",
  "activity",
  "product",
] as const;

export const ENTITY_KINDS = ["brand", "product", "place", "dish"] as const;
export const SENTIMENTS = ["positive", "neutral", "negative"] as const;

// analysis-worker 가 강제하는 출력 JSON 스키마 (structured outputs).
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    domain: { type: "string", enum: [...DOMAINS] },
    tags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tag: { type: "string" },
          type: { type: "string", enum: [...TAG_TYPES] },
          // 0..1. structured outputs는 numeric 제약(minimum/maximum)을 지원하지 않으므로
          // 범위 검증은 집계 단계에서 처리한다.
          confidence: { type: "number" },
        },
        required: ["tag", "type", "confidence"],
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: [...ENTITY_KINDS] },
        },
        required: ["name", "kind"],
      },
    },
    sentiment: { type: "string", enum: [...SENTIMENTS] },
    themes: { type: "array", items: { type: "string" } },
    is_ad_or_promo: { type: "boolean" },
  },
  required: ["domain", "tags", "entities", "sentiment", "themes", "is_ad_or_promo"],
} as const;

// 고정 system 프롬프트. 길이를 충분히 확보해 prompt caching prefix 로 재사용한다.
export const EXTRACTION_SYSTEM_PROMPT = `You are a consumer-trend analyst. You read a single social media post
(an image and/or its caption/title) and extract structured signals used to detect
emerging consumer trends. You never profile individuals; you only describe the
content, products, styles, and themes shown.

Classify each post into exactly one primary domain:
- food: dishes, recipes, ingredients, restaurants, drinks, cooking.
- fashion: clothing, outfits, accessories, beauty looks, styling.
- travel: destinations, trips, hotels, attractions, transport experiences.
- lifestyle: home, wellness, routines, hobbies, interiors not tied to an appliance.
- home_appliance: usage of appliances (air fryer, robot vacuum, fridge, washer,
  coffee machine, etc.) — choose this when the appliance itself is central.
- other: anything not matching the above.

Extract:
- tags: specific, reusable concepts that could trend (e.g. "dalgona coffee",
  "quiet luxury", "solo travel", "air fryer salmon"). Use lowercase, concise noun
  phrases. Avoid generic words ("food", "nice"). Assign a type and a confidence 0-1.
- entities: concrete brands, products, places, or dishes mentioned or clearly shown.
- sentiment: overall tone toward the subject.
- themes: 1-4 higher-level themes (e.g. "convenience cooking", "minimalism").
- is_ad_or_promo: true if the post is an advertisement or sponsored/branded promo.

Be conservative with confidence. Prefer fewer high-quality tags over many weak ones.`;
