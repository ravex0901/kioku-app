import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// 管理ダッシュボード専用のSupabaseクライアント。
// SUPABASE_SERVICE_ROLE_KEY はRLS(行レベルセキュリティ)を迂回できる強力な鍵のため、
// 必ずサーバー側(Server Component / Server Action)からのみ使用し、
// クライアントに公開したり、管理者以外の操作経路から呼び出したりしないと。
// 環境変数が未設定の場合はnullを返し、呼び出し側で「未設定」として扱う。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }
  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// 管理ダッシュボード専用のSupabaseクライアント。
// SUPABASE_SERVICE_ROLE_KEY はRLS(行レベルセキュリティ)を迂回できる強力な鍵のため、
// 必ずサーバー側(Server Component / Server Action)からのみ使用し、
// クライアントに公開したり、管理者以外の操作経路から呼び出したりしないと。
// 環境変数が未設定の場合はnullを返し、呼び出し側で「未設定」として扱う。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }
  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
