// 運営(管理者)だけが管理ダッシュボードに入れるようにするための簡易判定。
// ADMIN_EMAILS 環境変数(カンマ区切りのメールアドレス一覧)に含まれるメールアドレスで
// ログインしているユーザーだけを管理者として扱う。専用の管理者アカウントテーブルは
// 設けず、まずは環境変数ベースの最小構成にしている。
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
