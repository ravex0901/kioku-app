// 秘密情報の平文保存を防ぐガード(請求項9:
// 「ログインパスワード・秘密鍵等は平文保存しない。原則として保存対象外とし、
//   必要な秘密情報は専用の秘密管理方式を別途設計する」に対応)
//
// このシステムには専用の秘密情報管理(暗号化ボールト等)は実装していないため、
// パスワード・秘密鍵等とみなせる文字列がメモ等に入力された場合は
// 保存自体をブロックし、ユーザーに削除・言い換えを促す。

const SECRET_KEYWORDS = [
  "パスワード",
  "パスフレーズ",
  "暗証番号",
  "PIN",
  "ピン番号",
  "秘密鍵",
  "秘密キー",
  "秘密の質問",
  "シークレットキー",
  "シードフレーズ",
  "リカバリーフレーズ",
  "復元フレーズ",
  "password",
  "passwd",
  "secret key",
  "secretkey",
  "private key",
  "privatekey",
  "api key",
  "apikey",
  "seed phrase",
];

export type SecretGuardResult = {
  blocked: boolean;
  matchedKeyword?: string;
};

// 対象文字列の中に、秘密情報らしいキーワード＋具体的な値(記号等を含む連続文字列)が
// 一緒に含まれていないかを簡易チェックする。
// 誤検知を避けるため「キーワードの存在」のみで即ブロックはせず、
// キーワードの近くに値らしき文字列(4文字以上の英数記号の並び)がある場合に限りブロックする。
export function checkForPlaintextSecret(
  ...texts: (string | null | undefined)[]
): SecretGuardResult {
  const combined = texts.filter(Boolean).join("\n");
  if (!combined) return { blocked: false };
  const lower = combined.toLowerCase();

  for (const keyword of SECRET_KEYWORDS) {
    const kw = keyword.toLowerCase();
    const idx = lower.indexOf(kw);
    if (idx === -1) continue;

    // キーワード周辺(前後40文字)に、値らしき連続文字列があるか確認する
    const windowStart = Math.max(0, idx - 40);
    const windowEnd = Math.min(combined.length, idx + kw.length + 40);
    const around = combined.slice(windowStart, windowEnd);

    // 4文字以上の英数字・記号の連続(値っぽいもの)、または区切り記号(: = →)の直後の文字列
    const valueLike =
      /[A-Za-z0-9!#$%&*@._-]{4,}/.test(around.replace(new RegExp(kw, "i"), "")) ||
      /[:：=→]\s*\S{2,}/.test(around);

    if (valueLike) {
      return { blocked: true, matchedKeyword: keyword };
    }
  }

  return { blocked: false };
}

export const SECRET_GUARD_MESSAGE =
  "パスワードや秘密鍵など、他人に知られてはいけない秘密の情報が含まれているようです。安全のため、この内容は保存できません。合言葉や実際の値は書かず、「保管場所」や「担当者」など、思い出すための手がかりだけを記録してください。";
