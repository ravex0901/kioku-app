import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { getMyFamilyNotifications } from "@/app/actions/familyNotifications";

export async function Header() {
  // ご家族からの未読のお知らせ件数(ベルのバッジに表示する)
  const notifications = await getMyFamilyNotifications();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-green-100 bg-cream/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/home"
            className="font-serif-jp text-lg font-bold tracking-wide text-green-700"
          >
            きおく
          </Link>
          <Link
            href="/notifications"
            aria-label={
              unreadCount > 0 ? `未読のお知らせ${unreadCount}件` : "お知らせ"
            }
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-green-700 transition hover:bg-divider/15"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M12 5a5 5 0 0 0-5 5v3.5L5 17h14l-2-3.5V10a5 5 0 0 0-5-5Z"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinejoin="round"
              />
              <path
                d="M10 20a2 2 0 0 0 4 0"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </div>
      </header>
      <BottomNav />
    </>
  );
}
