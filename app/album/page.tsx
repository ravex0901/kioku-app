import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { AlbumClient } from "@/components/AlbumClient";
import { listAlbumPhotos } from "@/app/actions/album";

export default async function AlbumPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const result = await listAlbumPhotos();

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <BackButton />
        <h1 className="mb-1 mt-4 font-serif-jp text-xl font-bold text-ink">
          アルバム
        </h1>
        <p className="mb-6 text-sm text-ink/60">
          スマホの写真を選ぶだけで、このシステムの中にも保存しておけます。
        </p>

        {result.ok ? (
          <AlbumClient initialPhotos={result.photos} />
        ) : (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {result.error}
          </p>
        )}
      </main>
    </div>
  );
}
