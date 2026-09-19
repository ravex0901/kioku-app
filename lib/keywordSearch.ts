// 自然言語質問からのキーワード抽出＋メタデータ絞り込み
// (請求項1「自然言語質問を解析し、キーワード検索＋ベクトル検索＋メタデータ絞り込みを実行する」に対応)
//
// 注記(正直な開示): 本実装は文字列一致によるキーワード検索＋メタデータ絞り込みであり、
// 真のベクトル(Embedding)検索ではない。Embedding生成には専用のAPI/鍵が必要なため、
// 今回のフェーズでは未実装。将来Embeddingプロバイダを導入した際に、
// ここでの絞り込み結果と組み合わせるベクトル検索を追加する想定。

// ひらがな・カタカナ・記号等の助詞・一般語を除いた「意味のありそうな」語だけを粗く抽出する。
const STOP_WORDS = new Set([
  "は",
  "が",
  "を",
  "に",
  "で",
  "と",
  "の",
  "も",
  "や",
  "へ",
  "から",
  "まで",
  "です",
  "ます",
  "した",
  "して",
  "ください",
  "教えて",
  "どこ",
  "何",
  "なに",
  "ある",
  "あります",
  "ですか",
  "か",
]);

export function extractKeywords(question: string): string[] {
  // 日本語は分かち書きが難しいため、2〜10文字のN-gram的な部分文字列と、
  // 英数字の単語をキーワード候補として抽出する簡易実装。
  const cleaned = question.replace(/[?？、。!!]/g, " ");
  const asciiWords = cleaned.match(/[A-Za-z0-9]{2,}/g) ?? [];
  const kanjiKanaChunks =
    cleaned.match(/[一-鿿゠-ヿ぀-ゟ]{2,}/g) ?? [];

  const candidates = [...asciiWords, ...kanjiKanaChunks]
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  return Array.from(new Set(candidates));
}

// 文字列フィールド群を対象に、キーワードのいずれかを含むレコードを優先する。
// マッチが少なすぎる場合(全件除外になる等)は絞り込まず全件返すフォールバックを行い、
// 「検索できたはずの情報が見つからない」という体験を避ける。
export function filterByKeywords<T>(
  rows: T[],
  keywords: string[],
  toSearchableText: (row: T) => string
): T[] {
  if (keywords.length === 0) return rows;

  const matched = rows.filter((row) => {
    const text = toSearchableText(row).toLowerCase();
    return keywords.some((k) => text.includes(k.toLowerCase()));
  });

  // 一定件数以上マッチした場合のみ絞り込みを採用する(誤って0件になるのを防ぐ)
  if (matched.length > 0) return matched;
  return rows;
}
