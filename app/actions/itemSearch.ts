"use server";

// AI検索部(請求項1・明細書図7〜9「写真で探す」に対応)
//
// 既存の lib/keywordSearch.ts は、質問文からの単純な正規表現(N-gram)抽出であり、
// 「AI処理により検索用キーを生成する」という請求項の文言には対応していなかった
// (同ファイルのコメント参照)。本ファイルは、写真またはテキストクエリを実際に
// Claude(生成AI)に渡して検索用キーワードを生成させ、そのキーワードを用いて
// 登録済みの遺品情報(items)を検索する、独立した検索機能を提供する。

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { resolveLocationName } from "@/lib/format";
import { CATEGORY_OPTIONS, labelFor } from "@/lib/constants";
import type { CategoryMajor } from "@/lib/types";

export type SearchResultItem = {
  id: string;
  name: string;
  categoryLabel: string;
  locationName: string;
  estimatedPriceRange: string | null;
  photoUrl: string | null;
};

export type ItemSearchResult =
  | { ok: true; keywords: string[]; results: SearchResultItem[] }
  | { ok: false; error: string };

type ItemRow = {
  id: string;
  name: string;
  category_major: CategoryMajor | null;
  category_minor: string | null;
  memo: string | null;
  estimated_price_range: string | null;
  photo_url: string | null;
  location: { name: string } | { name: string }[] | null;
};

function extractJsonArray(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("AIの応答から検索キーワードを取得できませんでした。");
  }
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) {
    throw new Error("検索キーワードの形式が不正です。");
  }
  return parsed.filter((k): k is string => typeof k === "string" && k.trim().length > 0);
}

const PHOTO_SEARCH_PROMPT = `あなたは生前整理・遺品整理アプリ「きおく」の検索アシスタントです。
この写真に写っている物を、家族がすでに登録している持ち物一覧の中から探し出すための
検索キーワードを、日本語で5〜10個、考えてください。

文字・ロゴ・型番・ブランド名が読み取れる場合は最優先でキーワードに含め、
読み取れない場合は品目・色・素材・用途などの特徴語を含めてください。

説明文などは一切付けず、次の形式のJSON配列のみを出力してください。
例: ["ネックレス","金","K18","アクセサリー","貴金属"]`;

/**
 * 写真で探す(請求項1のAI検索部・明細書図7〜9に対応)。
 * ユーザーが指定した写真をAIが解析して検索用キーを生成し、
 * そのキーワードを用いて登録済みの遺品情報を検索する。
 */
export async function searchItemsByPhoto(
  base64Data: string,
  mediaType: string
): Promise<ItemSearchResult> {
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
    return { ok: false, error: "この画像形式はAI検索に対応していません。" };
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 256,
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
            { type: "text", text: PHOTO_SEARCH_PROMPT },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("AIから有効な応答がありませんでした。");
    }

    const keywords = extractJsonArray(textBlock.text);
    return await runKeywordSearch(keywords);
  } catch (err) {
    console.error("searchItemsByPhoto error", err);
    return { ok: false, error: "写真での検索に失敗しました。もう一度お試しください。" };
  }
}

const TEXT_SEARCH_KEY_PROMPT = (query: string) => `あなたは生前整理・遺品整理アプリ「きおく」の検索アシスタントです。
次のユーザーの検索リクエストに一致しそうな持ち物を、家族がすでに登録している
持ち物一覧の中から探し出すための検索キーワードを、日本語で3〜8個考えてください。
入力された言葉そのものに加えて、類義語・関連語・上位/下位カテゴリの言葉も含めてください
(例:「貴重品」→「貴重品」「貴金属」「時計」「アクセサリー」「現金」「高価」)。

検索リクエスト:「${query}」

説明文などは一切付けず、次の形式のJSON配列のみを出力してください。
例: ["貴重品","貴金属","時計","アクセサリー","現金","高価"]`;

/**
 * メモ・キーワードで探す(請求項1のAI検索部に対応)。
 * ユーザーの検索リクエスト(自然文)をAIが解析して検索用キーを生成し、
 * そのキーワードを用いて登録済みの遺品情報を検索する。
 * 「AIと会話する」(問い合わせへの回答生成=請求項1のAI回答生成部)とは異なり、
 * 本機能は検索結果の一覧を返すことに特化した独立の検索機能である。
 */
export async function searchItemsByText(query: string): Promise<ItemSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: false, error: "検索したい内容を入力してください。" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI機能が設定されていません。" };
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 256,
      messages: [{ role: "user", content: TEXT_SEARCH_KEY_PROMPT(trimmed) }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("AIから有効な応答がありませんでした。");
    }

    const keywords = extractJsonArray(textBlock.text);
    return await runKeywordSearch(keywords.length > 0 ? keywords : [trimmed]);
  } catch (err) {
    console.error("searchItemsByText error", err);
    return { ok: false, error: "検索に失敗しました。もう一度お試しください。" };
  }
}

async function runKeywordSearch(keywords: string[]): Promise<ItemSearchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "ログインが必要です。" };
  }

  const { data } = await supabase
    .from("items")
    .select("id, name, category_major, category_minor, memo, estimated_price_range, photo_url, location:locations(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const allRows = (data ?? []) as unknown as ItemRow[];

  // lib/keywordSearch.ts の filterByKeywords は「0件になるくらいなら全件返す」という
  // 会話(AIと会話する)向けのフォールバック仕様のため、検索専用の本機能では使わず、
  // ここで単純な部分一致フィルタを行う。0件なら素直に0件を返す(該当なしを正直に伝える)。
  const rows =
    keywords.length === 0
      ? allRows
      : allRows.filter((item) => {
          const text = [item.name, item.category_minor, item.memo]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return keywords.some((k) => text.includes(k.toLowerCase()));
        });

  const photoMap = await getSignedUrlMap(
    supabase,
    rows.map((item) => item.photo_url)
  );

  const results: SearchResultItem[] = rows.map((item) => ({
    id: item.id,
    name: item.name,
    categoryLabel: labelFor(CATEGORY_OPTIONS, item.category_major),
    locationName: resolveLocationName(item.location),
    estimatedPriceRange: item.estimated_price_range,
    photoUrl: item.photo_url ? photoMap[item.photo_url] ?? null : null,
  }));

  return { ok: true, keywords, results };
}
