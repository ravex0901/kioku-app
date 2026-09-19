"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { DIGITAL_ITEM_STATUS_OPTIONS, DIGITAL_ITEM_TYPE_OPTIONS, labelFor } from "@/lib/constants";
import { extractKeywords, filterByKeywords } from "@/lib/keywordSearch";
import type { DigitalItemStatus, DigitalItemType } from "@/lib/types";

export type ReferencedDigitalItem = { id: string; title: string };

export type AskAboutDigitalItemsResult =
  | { ok: true; answer: string; referencedItems: ReferencedDigitalItem[] }
  | { ok: false; error: string };

type DigitalItemRow = {
  id: string;
  item_type: DigitalItemType | null;
  title: string;
  memo: string | null;
  contact_person?: string | null;
  related_documents?: string | null;
  status?: DigitalItemStatus | null;
};

const ASK_SYSTEM_PROMPT =
  "あなたは生前整理を支援するアプリ「きおく」の「契約・情報のしおり」アシスタントです。" +
  "パスワードや暗証番号そのものは記録されていません。以下に渡される、ユーザーが登録済みの" +
  "デジタル情報・契約情報(サブスク、アカウント、金融、保険、契約など)の一覧だけを根拠に、" +
  "日本語でやさしく、簡潔に答えてください。データに書かれていないことは推測せず、" +
  "わからない場合は「登録されている情報からはわかりません」と正直に答えてください。" +
  "該当する項目がある場合は、タイトルとメモの内容を示しながら回答してください。" +
  "回答は必ず次のJSON形式のみで出力してください(説明文やコードブロックの記号は付けない):" +
  '{"answer": "ユーザーへの回答本文(日本語)", "referenced_item_titles": ["回答の根拠にした項目のタイトルを、渡された一覧のタイトルと完全一致する形でできるだけ挙げる"]}' +
  "該当する項目がない場合、referenced_item_titlesは空配列にしてください。";

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AIの応答からJSONを取得できませんでした。");
  return JSON.parse(match[0]);
}

/**
 * 「デジタル・契約」機能の「AIに聞く」: 登録済みのデジタル情報・契約情報をもとに、
 * 自然言語の質問にAIが回答する(特許図面【図10】〜【図13】、【図23】【図24】に対応)。
 */
export async function askAboutDigitalItems(
  question: string
): Promise<AskAboutDigitalItemsResult> {
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

  const { data, error: selectError } = await supabase
    .from("digital_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (selectError) {
    return {
      ok: false,
      error:
        "デジタル情報の取得に失敗しました。データベースの設定を確認してください。",
    };
  }

  const allRows = (data ?? []) as DigitalItemRow[];

  if (allRows.length === 0) {
    return {
      ok: true,
      answer:
        "まだ何も登録されていません。まずは「契約・情報のしおり」から1件残してみましょう。",
      referencedItems: [],
    };
  }

  const keywords = extractKeywords(trimmed);
  const rows = filterByKeywords(allRows, keywords, (row) =>
    [row.title, row.memo, row.contact_person].filter(Boolean).join(" ")
  );

  const dataText = rows
    .map((row) => {
      const typeLabel = labelFor(DIGITAL_ITEM_TYPE_OPTIONS, row.item_type);
      const memoText = row.memo ? ` / 一言メモ:${row.memo}` : "";
      const contactText = row.contact_person
        ? ` / 手続担当者:${row.contact_person}`
        : "";
      const docsText = row.related_documents
        ? ` / 関連書類:${row.related_documents}`
        : "";
      const statusText = row.status
        ? ` / 状態:${labelFor(DIGITAL_ITEM_STATUS_OPTIONS, row.status)}`
        : "";
      return `・種別:${typeLabel} / タイトル:${row.title}${memoText}${contactText}${docsText}${statusText}`;
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
          content: `【登録されているデジタル情報・契約情報一覧】\n${dataText}\n\n【質問】\n${trimmed}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("AIから有効な応答がありませんでした。");
    }

    let answer = textBlock.text.trim();
    let referencedItems: ReferencedDigitalItem[] = [];
    try {
      const parsed = extractJson(textBlock.text) as {
        answer?: unknown;
        referenced_item_titles?: unknown;
      };
      if (typeof parsed.answer === "string" && parsed.answer.trim()) {
        answer = parsed.answer.trim();
      }
      if (Array.isArray(parsed.referenced_item_titles)) {
        const titles = parsed.referenced_item_titles.filter(
          (t): t is string => typeof t === "string"
        );
        referencedItems = rows
          .filter((r) => titles.includes(r.title))
          .map((r) => ({ id: r.id, title: r.title }));
      }
    } catch {
      // JSON形式で返らなかった場合は、テキストそのものを回答として使う(フォールバック)
    }

    return { ok: true, answer, referencedItems };
  } catch (err) {
    console.error("askAboutDigitalItems error", err);
    return {
      ok: false,
      error: "回答の取得に失敗しました。もう一度お試しください。",
    };
  }
}
