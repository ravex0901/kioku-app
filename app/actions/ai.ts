"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { resolveLocationName } from "@/lib/format";
import { CATEGORY_OPTIONS, DISPOSITION_OPTIONS, labelFor } from "@/lib/constants";
import { extractKeywords, filterByKeywords } from "@/lib/keywordSearch";
import { formatPriceDisplay } from "@/lib/priceRange";
import type { CategoryMajor } from "@/lib/types";

const CATEGORY_VALUES: CategoryMajor[] = [
  "furniture",
  "appliance",
  "clothing",
  "tableware",
  "books",
  "jewelry",
  "watch",
  "asset",
  "subscription",
  "insurance",
  "other",
];

const CONDITION_VALUES = ["good", "used", "needs_repair"] as const;
export type ItemCondition = (typeof CONDITION_VALUES)[number];

export type ItemAiSuggestion = {
  name: string;
  categoryMajor: CategoryMajor;
  categoryOther: string | null;
  condition: ItemCondition;
  estimatedPriceRange: string | null;
};

export type AnalyzeItemPhotoResult =
  | { ok: true; suggestion: ItemAiSuggestion }
  | { ok: false; error: string };

const PROMPT = `あなたは中古品の査定・生前整理の専門家です。この写真に写っている家財・持ち物について、
できるだけ具体的かつ正確に推定してください。以下の手順で慎重に確認してから回答してください。

1. 写真の中に文字・ロゴ・型番・ブランド名・製品ラベルが写っていないか隅々まで確認する。
   文字が読み取れる場合は、それを最優先で品名に反映する
   (例: 「椅子」ではなく「カリモク60 Kチェア」、「テレビ」ではなく「SONY BRAVIA 43型」のように、
   読み取れたブランド名・製品名・型番をできる限り具体的に品名に含める)。
2. 文字やロゴが読み取れない、または不鮮明な場合のみ、形状・素材・デザインの特徴から
   一般的な品名(例: 「木製の学習机」「ステンレス製の鍋」)を推定する。曖昧な当て推量はしない。
3. 品目のジャンル、状態(良好・使用感あり・要修理)を判定する。
   腕時計・懐中時計など「時計」は category_major を "watch" とすること。
   ただし、金・プラチナなどの貴金属やK18/K10/K24などの刻印がある(と思われる)
   ネックレス・指輪などは、写真だけでは本物か・純度・重量を正確に判定できず、
   誤った前提で扱うとトラブルの原因になるため、category_major は "jewelry" にせず
   "other" とし、category_other には "貴金属・アクセサリー" と設定すること。
4. 日本国内の中古市場(メルカリ・ジモティー・リサイクルショップなど)の実勢価格感を踏まえ、
   売却した場合のおおよその上限額を見積もる。下限〜上限のような「幅」を提示すると、
   実際の売却額との差でユーザーに誤解や不信を与えるリスクがあるため、
   必ず上限額1つのみを見積もること。ブランド品や高価なものほど根拠を持ちて高めに、
   一般的な日用品は控えめに見積もる。時計もブランド・モデルが判別できる場合は
   通常通り金額を見積もってよい。売却価値がほぼ無いと判断される場合は
   "値段がつきにくい" のように正直に答えてよい。
   ただし手順3で貴金属・アクセサリーと判定した場合は、写真だけでは重量・純度が
   わからず金額を見積もれないため、estimated_price_range には null を設定し、
   案内文や仮の金額など、金額以外の文字列は一切書かないこと。

説明文などは一切付けず、次の形式のJSONオブジェクトのみを出力してください。

{
  "name": "品名(30文字以内の日本語。可能な限りブランド名・製品名・型番を含める)",
  "category_major": "furniture" | "appliance" | "clothing" | "tableware" | "books" | "watch" | "asset" | "subscription" | "insurance" | "other" のいずれか(貴金属・アクセサリーと思われる場合も含め "jewelry" は使わないこと),
  "category_other": "category_majorがotherの場合のみ具体的なジャンル名(日本語)。それ以外はnull",
  "condition": "good" | "used" | "needs_repair" のいずれか(良好・使用感あり・要修理),
  "estimated_price_range": "売却した場合のおおよその上限額のみ(幅は示さない。日本語、例: '〜10,000円', '〜3,000円', '値段がつきにくい')。金額を見積もれない場合(貴金属・アクセサリー等)は文字列ではなく null を設定すること"
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
      max_tokens: 768,
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

    const rawPriceText =
      typeof parsed.estimated_price_range === "string"
        ? parsed.estimated_price_range.trim()
        : "";
    // 貴金属の重量計測を促す案内文などが金額として紛れ込むのを防ぐ
    // (円の金額表記や「値段がつきにくい」以外の長い説明文は価格として扱わない)。
    const looksLikeGuidanceText =
      rawPriceText.length > 15 &&
      !rawPriceText.includes("円") &&
      rawPriceText !== "値段がつきにくい";
    const estimatedPriceRange =
      rawPriceText && !looksLikeGuidanceText
        ? formatPriceDisplay(rawPriceText.slice(0, 30))
        : null;

    return {
      ok: true,
      suggestion: {
        name,
        categoryMajor: categoryMajor as CategoryMajor,
        categoryOther,
        condition: condition as ItemCondition,
        estimatedPriceRange,
      },
    };
  } catch (err) {
    console.error("analyzeItemPhoto error", err);
    return { ok: false, error: "判定に失敗しました。手動で入力してください。" };
  }
}

export type ReferencedItem = { id: string; name: string };

export type AskAboutItemsResult =
  | { ok: true; answer: string; referencedItems: ReferencedItem[] }
  | { ok: false; error: string };

type ItemRow = {
  id: string;
  name: string;
  category_major: CategoryMajor | null;
  category_minor: string | null;
  disposition: string | null;
  memo: string | null;
  estimated_price_range?: string | null;
  location: { name: string } | { name: string }[] | null;
};

const ASK_SYSTEM_PROMPT =
  "あなたは生前整理を支援するアプリ「きおく」の音声アシスタントです。" +
  "ユーザーは音声、またはテキストで質問します。以下に渡される、ユーザーが登録済みの持ち物データだけを根拠に、" +
  "日本語でやしく、簡潔に答えてください。データに書かれていないことは推測せず、" +
  "わからない場合は「登録されている情報からはわかりません」と正直に答えてください。" +
  "一覧で答えるほうがわかりやすい場合は、箇条書きを使ってください。" +
  "回答は必ず次のJSON形式のみで出力してください(説明文やコードブロックの記号は付けない):" +
  '{"answer": "ユーザーへの回答本文(日本語)", "referenced_item_names": ["回答の根拠にした持ち物の名称を、渡された一覧の名称と完全一致する形でできるだけ挙げる"]}' +
  "該当する持ち物がない場合、referenced_item_namesは空配列にしてください。";

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
    .select("*, location:locations(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const allRows = (data ?? []) as ItemRow[];

  if (allRows.length === 0) {
    return {
      ok: true,
      answer:
        "まだ何も登録されていません。まずは「ものを登録する」から1品登録してみましょう。",
      referencedItems: [],
    };
  }

  // キーワード検索＋メタデータ絞り込み(請求項1)。真のベクトル検索は未実装(lib/keywordSearch.ts参照)。
  const keywords = extractKeywords(trimmed);
  const rows = filterByKeywords(allRows, keywords, (item) =>
    [item.name, item.category_minor, item.memo].filter(Boolean).join(" ")
  );

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
      const priceText = item.estimated_price_range
        ? ` / 推定売却額:${formatPriceDisplay(item.estimated_price_range)}`
        : "";
      return `・${item.name} / ジャンル:${category} / 場所:${locationName} / 整理方針:${dispositionLabel}${priceText}${memoText}`;
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

    let answer = textBlock.text.trim();
    let referencedItems: ReferencedItem[] = [];
    try {
      const parsed = extractJson(textBlock.text) as {
        answer?: unknown;
        referenced_item_names?: unknown;
      };
      if (typeof parsed.answer === "string" && parsed.answer.trim()) {
        answer = parsed.answer.trim();
      }
      if (Array.isArray(parsed.referenced_item_names)) {
        const names = parsed.referenced_item_names.filter(
          (n): n is string => typeof n === "string"
        );
        referencedItems = rows
          .filter((r) => names.includes(r.name))
          .map((r) => ({ id: r.id, name: r.name }));
      }
    } catch {
      // JSON形式で返らなかった場合は、テキストそのものを回答として使う(フォールバック)
    }

    return { ok: true, answer, referencedItems };
  } catch (err) {
    console.error("askAboutItems error", err);
    return {
      ok: false,
      error: "回答の取得に失敗しました。もう一度お試しください。",
    };
  }
}

export type AskAboutProcedureResult =
  | { ok: true; answer: string }
  | { ok: false; error: string };

const PROCEDURE_SYSTEM_PROMPT =
  "あなたは生前整理を支援するアプリ「きおく」の相続手続きサポートAIです。" +
  "相続手続きのやり方がわからない方向けに、今から提示する「手続きの名称・期限・必要書類」について、" +
  "具体的な進め方(何から始めるか、書類をどこで入手するか、どこに提出するか等)を、" +
  "専門用語をできるだけ避け、やさしく簡潔な日本語で説明してください。" +
  "断定的な法的判断・税務判断は行わず、個別の状況によって扱いが変わる可能性がある場合は、" +
  "税理士・弁護士・司法書士や市区町村の窓口などの専門家に確認するよう案内を添えてください。" +
  "説明文以外の前置きや挨拶は不要です。";

/**
 * 相続手続きチェックリストの各項目について、やり方がわからないユーザーがAIに質問できる機能。
 * (請求項の相続レポート機能を補助するぁ手続き支援のためのQ&A。判定エンジン自体は
 *  lib/inheritanceProcedures.ts のルールベース判定を用い、ここでは会話的な説明のみを行う)
 */
export async function askAboutInheritanceProcedure(
  procedure: { title: string; deadline: string; documents: string[] },
  question: string
): Promise<AskAboutProcedureResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { ok: false, error: "質問を入力してください。" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI機能が設定されていません。" };
  }

  const contextText =
    `【手続き名】${procedure.title}\n` +
    `【期限】${procedure.deadline}\n` +
    `【必要書類】${procedure.documents.join("、") || "特になし"}`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system: PROCEDURE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${contextText}\n\n【質問】\n${trimmed}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("AIから有効な応答がありませんでした。");
    }

    return { ok: true, answer: textBlock.text.trim() };
  } catch (err) {
    console.error("askAboutInheritanceProcedure error", err);
    return {
      ok: false,
      error: "回答の取得に失敗しました。もう一度お試しください。",
    };
  }
}
