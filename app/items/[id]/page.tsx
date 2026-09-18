import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrl } from "@/lib/storage";
import { resolveLocationName } from "@/lib/format";
import { Header } from "@/components/Header";
import { ItemDetail } from "@/components/ItemDetail";

export default async function ItemDetailPage({
  params,
}: PageProps<"/items/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: item }, { data: locations }] = await Promise.all([
    supabase
      .from("items")
      .select("*, location:locations(name)")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("locations").select("*").eq("user_id", user.id),
  ]);

  if (!item) {
    notFound();
  }

  const signedPhotoUrl = await getSignedUrl(supabase, item.photo_url);

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <ItemDetail
          item={item}
          initialLocations={locations ?? []}
          signedPhotoUrl={signedPhotoUrl}
          locationName={resolveLocationName(item.location)}
        />
      </main>
    </div>
  );
}
