"use server";

import Anthropic from "@anthropic-ai/sdk";
import type { CategoryMajor } from "@/lib/types";

const CATEGORY_VALUES: CategoryMajor[] = [
  "furniture",
  "appliance",
  "clothing",
  "tableware",
  "books",
  "jewelry",
  "other",
];

const CONDITION_VALUES = ["good", "used", "needs_repair"] as const;
export type ItemCondition = (typeof CONDITION_VALUES)[number];

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  good: "良好",
  used: "使用感あり",
  needs_repair: "要修理",
};

export type ItemAiSuggestion = {
  name: string;
  categoryMajor: CategoryMajor;
  categoryOther: string | null;
  condition: ItemCondition;
};

export type AnalyzeItemPhotoResult =
  | { ok: true; suggestion: ItemAiSuggestion }
  | { ok: false; error: string };

const PROMPT = `この写真に写っている家財・持ち物について、生前整理を支援するアプリのために推定してください。
説明文などは一切付けず、次の形式のJSONオブジェクトのみを出力してください。

{
  "name": "品名(20文字以内の日本語)",
  "category_major": "furniture" | "appliance" | "clothing" | "tableware" | "books" | "jewelry" | "other" のいずれか,
  "category_other": "category_majorがotherの場合のみ具体的なジャンル名(日本語)。それ以外はnull",
  "condition": "good" | "used" | "needs_repair" のいずれか(良好・使用感あり・要修理)
}`;

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AIの応答からJSONを取得できませんでした。");
  }
  return JSON.parse(match[0]);
}

export async function analyzeItemPhoto(
  base64Data: string,
  mediaType: string
): Promise<AnalyzeItemPhotoResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI機能が設定されていません。" };
  }

  const supportedMediaTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ] as const;
  if (!supportedMediaTypes.includes(mediaType as (typeof supportedMediaTypes)[number])) {
    return { ok: false, error: "この画像形式はAI判定に対応していません。" };
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as (typeof supportedMediaTypes)[number],
                data: base64Data,
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("AIから有効な応答がありませんでした。");
    }

    const parsed = extractJson(textBlock.text) as Record<string, unknown>;

    const categoryMajor = parsed.category_major;
    if (
      typeof categoryMajor !== "string" ||
      !CATEGORY_VALUES.includes(categoryMajor as CategoryMajor)
    ) {
      throw new Error("ジャンルの推定結果が不正です。");
    }

    const condition = parsed.condition;
    if (
      typeof condition !== "string" ||
      !CONDITION_VALUES.includes(condition as ItemCondition)
    ) {
      throw new Error("状態の推定結果が不正です。");
    }

    const name =
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim().slice(0, 40)
        : "名称不明のもの";

    const categoryOther =
      categoryMajor === "other" && typeof parsed.category_other === "string"
        ? parsed.category_other.trim() || null
        : null;

    return {
      ok: true,
      suggestion: {
        name,
        categoryMajor: categoryMajor as CategoryMajor,
        categoryOther,
        condition: condition as ItemCondition,
      },
    };
  } catch (err) {
    console.error("analyzeItemPhoto error", err);
    return { ok: false, error: "判定に失敗しました。手動で入力してください。" };
  }
}
