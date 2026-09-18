"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type ConnectionStatus = "checking" | "ok" | "error";

export default function Home() {
  const [status, setStatus] = useState<ConnectionStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ error }) => {
        if (cancelled) return;
        setStatus(error ? "error" : "ok");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel = {
    checking: "データベース接続: 確認中",
    ok: "データベース接続: OK",
    error: "データベース接続: 失敗",
  }[status];

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Next.js + Supabase 最小構成アプリ</h1>
        <p>{statusLabel}</p>
      </main>
    </div>
  );
}
