import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { BottomNav } from "@/components/BottomNav";

export function Header() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-green-100 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/home"
            className="font-serif-jp text-lg font-bold tracking-wide text-green-700"
          >
            きおく
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-sm text-ink/50 transition hover:bg-black/5 hover:text-ink"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>
      <BottomNav />
    </>
  );
}
