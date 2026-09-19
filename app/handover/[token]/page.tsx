import { createClient } from "@/lib/supabase/server";
import { HandoverView, type HandoverStatus } from "@/components/HandoverView";

export default async function HandoverPage({
  params,
}: PageProps<"/handover/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_handover_status", {
    p_token: token,
  });

  const initialStatus = (data as unknown as HandoverStatus) ?? {
    found: false,
  };

  return (
    <div className="min-h-screen bg-cream">
      <HandoverView token={token} initialStatus={initialStatus} />
    </div>
  );
}
