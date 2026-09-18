import { setPurpose } from "@/app/actions/profile";
import { PURPOSE_OPTIONS } from "@/lib/constants";

export default function PurposePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-lg">
        <h1 className="text-center text-2xl font-bold text-green-700">
          今回のきっかけを教えてください
        </h1>
        <p className="mt-2 text-center text-sm text-ink/60">
          選んだ内容に合わせて、ご案内を調整します。
        </p>

        <div className="mt-8 flex flex-col gap-4">
          {PURPOSE_OPTIONS.map((option) => (
            <form key={option.value} action={setPurpose.bind(null, option.value)}>
              <button
                type="submit"
                className="w-full rounded-[1.75rem] border border-green-100 bg-white/70 p-5 text-left shadow-sm transition hover:border-green-300 hover:bg-green-50"
              >
                <span className="block text-lg font-semibold text-green-700">
                  {option.label}
                </span>
                <span className="mt-1 block text-sm text-ink/60">
                  {option.description}
                </span>
              </button>
            </form>
          ))}
        </div>
      </div>
    </main>
  );
}
