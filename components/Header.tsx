import Link from "next/link";
import { logout } from "@/app/actions/auth";

const NAV_LINKS = [
  { href: "/home", label: "ホーム" },
  { href: "/items", label: "見る・探す" },
  { href: "/locations", label: "場所を管理する" },
  { href: "/progress", label: "進捗マップ" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-green-100 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/home" className="text-lg font-bold text-green-700">
          きおく
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-ink/70 transition hover:bg-green-100 hover:text-green-700"
            >
              {link.label}
            </Link>
          ))}
          <form action={logout}>
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-ink/50 transition hover:bg-black/5 hover:text-ink"
            >
              ログアウト
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
