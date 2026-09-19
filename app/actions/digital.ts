"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { DIGITAL_ITEM_TYPE_OPTIONS, labelFor } from "@/lib/constants";
import type { DigitalItemType } from "@/lib/types";

export type AskAboutDigitalItemsResult =
  | { ok: true; answer: string }
  | { ok: false; error: string };

type DigitalItemRow = {
  item_type: DigitalItemType | null;
  title: string;
  memo: string | null;
};

const ASK_SYSTEM_PROMPT =
  "あなたは生前整理を支援するアプリ「きおく」の「契約・情報のしおり」アシスタントです。" +
  "パスワードや暗証番号そのものは記録されていません。以下に渡される、ユーザーが登録済みの" +
  "デジタル情報・契約情報(サブスク、アカウント、金融、保険、契約など)の一覧だけを根拠に、" +
  "日本語でやさしく、簡潔に答えてください。データに書かれていないことは推測せず、" +
  "わからない場合は「登録されている情報からはわかりません」と正直に答えてください。" +
  "該当する項目がある場合は、タイトルとメモの内容を示しながら回答してください。";

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

  const rows = (data ?? []) as DigitalItemRow[];

  if (rows.length === 0) {
    return {
      ok: true,
      answer:
        "まだ何も登録されていません。まずは「契約・情報のしおり」から1件残してみましょう。",
    };
  }

  const dataText = rows
    .map((row) => {
      const typeLabel = labelFor(DIGITAL_ITEM_TYPE_OPTIONS, row.item_type);
      const memoText = row.memo ? ` / 一言メモ:${row.memo}` : "";
      return `・種別:${typeLabel} / タイトル:${row.title}${memoText}`;
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

    return { ok: true, answer: textBlock.text.trim() };
  } catch (err) {
    console.error("askAboutDigitalItems error", err);
    return {
      ok: false,
      error: "回答の取得に失敗しました。もう一度お試しください。",
    };
  }
}

