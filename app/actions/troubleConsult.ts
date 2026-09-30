"use server";

// お困りごと相談AI
//
// トップページの写真登録セクションの下に置く「何でも相談」機能のサーバーアクション。
// ユーザー(主に高齢者とその家族)が入力した「困りごと」を生成AIに渡し、
// (1) AIの知識だけで答えられる相談には、その場で分かりやすく回答する
// (2) 電球交換・家具移動など、実際に人が現地に来て体を動かす必要がある作業は、
//     AIでは解決できないため「現地対応が必要」と判定し、電話での問い合わせに誘導する
// という2種類の応答を1回のAI呼び出しで振り分ける。

import Anthropic from "@anthropic-ai/sdk";

export type TroubleConsultResult =
  | { ok: true; answer: string; needsVisit: boolean; visitReason: string | null }
  | { ok: false; error: string };

class ConsultResponseError extends Error {}

function extractJson(text: string): { answer?: unknown; needsVisit?: unknown; visitReason?: unknown } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new ConsultResponseError("AIの応答を解析できませんでした。");
  }
  return JSON.parse(match[0]);
}

// エラーの種類に応じて案内文を出し分ける(app/actions/itemSearch.ts の
// describeSearchError と同じ考え方: 原因不明の一律メッセージではなく、
// 次に何をすればよいかが伝わる文言にする)
function describeConsultError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    if (status === 429) {
      return "AIへのリクエストが混み合っています。少し時間をおいてもう一度お試しください。";
    }
    if (status === 529 || (typeof status === "number" && status >= 500)) {
      return "AIサービスが一時的に混み合っています。少し時間をおいてもう一度お試しください。";
    }
  }
  if (err instanceof ConsultResponseError) {
    return "うまく回答をまとめられませんでした。もう少し具体的に教えていただくか、もう一度お試しください。";
  }
  return "相談の送信に失敗しました。もう一度お試しください。";
}

const SYSTEM_PROMPT = `あなたは生前整理・終活支援アプリ「きおく」の「お困りごと相談AI」です。
利用者は主に高齢者とそのご家族で、暮らしの中のちょっとした「困りごと」を何でも相談してきます。

次の2種類を見分けて対応してください。

1. 知識・アドバイスで解決できる相談
   (例: 「電球の種類が分からない」「粗大ゴミの出し方が分からない」「この保管方法で合っているか不安」など)
   → あなたの知識で、高齢者にも分かりやすい平易な言葉で、丁寧に回答してください。

2. 人が実際に現地(自宅)に来て体を動かす必要がある相談
   (例: 「電球を交換したいが脚立がなく高くて届かない」「家具や家電を移動させたいが重くて一人では無理」
   「庭の掃除をしてほしい」「不用品を運び出してほしい」など)
   → AIでは解決できないため、共感を示した上で「現地でのお手伝いが必要」と伝え、
     電話でのご相談・ご依頼を案内してください。回答本文は簡潔に。

説明文やコードブロックなどは一切付けず、次のJSON形式のみを出力してください。
{"answer": "利用者への回答本文(日本語、2〜4文程度)", "needsVisit": true または false, "visitReason": "現地対応が必要な理由を一言で(needsVisitがtrueの場合のみ。falseの場合は空文字)"}`;

/**
 * お困りごとをAIに相談する。
 * AIの知識で答えられる内容はその場で回答し、現地対応が必要と判断した場合は
 * needsVisit: true を返す(UI側で電話連絡・ご依頼への導線を表示する)。
 */
export async function askTroubleConsult(question: string): Promise<TroubleConsultResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { ok: false, error: "相談したい内容を入力してください。" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI機能が設定されていません。" };
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: trimmed }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new ConsultResponseError("AIから有効な応答がありませんでした。");
    }

    const parsed = extractJson(textBlock.text);
    const answer = typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : textBlock.text.trim();
    const needsVisit = parsed.needsVisit === true;
    const visitReason =
      needsVisit && typeof parsed.visitReason === "string" && parsed.visitReason.trim()
        ? parsed.visitReason.trim()
        : null;

    return { ok: true, answer, needsVisit, visitReason };
  } catch (err) {
    console.error("askTroubleConsult error", err);
    return { ok: false, error: describeConsultError(err) };
  }
}
