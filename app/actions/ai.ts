"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { resolveLocationName } from "@/lib/format";
import { CATEGORY_OPTIONS, DISPOSITION_OPTIONS, labelFor } from "@/lib/constants";
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

export type AskAboutItemsResult =
  | { ok: true; answer: string }
  | { ok: false; error: string };

type ItemRow = {
  name: string;
  category_major: CategoryMajor | null;
  category_minor: string | null;
  disposition: string | null;
  memo: string | null;
  location: { name: string } | { name: string }[] | null;
};

const ASK_SYSTEM_PROMPT =
  "あなたは生前整理を支援するアプリ「きおく」の音声アシスタントです。" +
  "ユーザーは音声、またはテキストで質問します。以下に渡される、ユーザーが登録済みの持ち物データだけを根拠に、" +
  "日本語でやさしく、簡潔に答えてください。データに書かれていないことは推測せず、" +
  "わからない場合は「登録されている情報からはわかりません」と正直に答えてください。" +
  "一覧で答えるほうがわかりやすい場合は、箇条書きを使ってください。";

/**
 * 「AIに話しかける」機能: 登録済みの持ち物データをもとに、音声/テキストの質問にAIが答える。
 */
export async function askAboutItems(
  question: string
): Promise<AskAboutItemsResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { ok: false, error: "質問を入力してください。" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI機能が設定されていません。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "ログインが必要です。" };
  }

  const { data } = await supabase
    .from("items")
    .select(
      "name, category_major, category_minor, disposition, memo, location:locations(name)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as ItemRow[];

  if (rows.length === 0) {
    return {
      ok: true,
      answer:
        "まだ何も登録されていません。まずは「ものを登録する」から1品登録してみましょう。",
    };
  }

  const dataText = rows
    .map((item) => {
      const locationName = resolveLocationName(item.location);
      const categoryLabel = labelFor(CATEGORY_OPTIONS, item.category_major);
      const category = item.category_minor
        ? `${categoryLabel}(${item.category_minor})`
        : categoryLabel;
      const dispositionLabel = labelFor(
        DISPOSITION_OPTIONS,
        item.disposition as (typeof DISPOSITION_OPTIONS)[number]["value"] | null
      );
      const memoText = item.memo ? ` / メモ:${item.memo}` : "";
      return `・${item.name} / ジャンル:${category} / 場所:${locationName} / 処分方針:${dispositionLabel}${memoText}`;
    })
    .join("\n");

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system: ASK_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `【登録されている持ち物一覧】\n${dataText}\n\n【質問】\n${trimmed}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("AIから有効な応答がありませんでした。");
    }

    return { ok: true, answer: textBlock.text.trim() };
  } catch (err) {
    console.error("askAboutItems error", err);
    return {
      ok: false,
      error: "回答の取得に失敗しました。もう一度お試しください。",
    };
  }
}
