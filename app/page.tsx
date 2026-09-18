"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ConnectionStatus = "checking" | "ok" | "error";

export default function Home() {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ error }) => {
        if (error) {
          setStatus("error");
          setMessage(error.message);
        } else {
          setStatus("ok");
        }
      })
      .catch((err: unknown) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        kioku-app
      </h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        データベース接続:{" "}
        {status === "checking" && "確認中..."}
        {status === "ok" && (
          <span className="font-semibold text-green-600 dark:text-green-400">
            OK
          </span>
        )}
        {status === "error" && (
          <span className="font-semibold text-red-600 dark:text-red-400">
            エラー ({message})
          </span>
        )}
      </p>
    </div>
  );
}
