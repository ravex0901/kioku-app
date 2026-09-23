"use client";

import { useEffect, useState } from "react";
import { getSavedVoiceURI, saveVoiceURI, speakText } from "@/lib/voicePreference";

// 「AIと会話する」機能の読み上げ(TTS)で使う声を選ぶ設定画面。
// ブラウザ標準のWeb Speech API(speechSynthesis)の声一覧から選択し、
// 選んだ声はこの端末のlocalStorageに保存される(サーバーには送信しない)。
export function VoiceSettings() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    function loadVoices() {
      const list = window.speechSynthesis.getVoices();
      setVoices(list);
      // onvoiceschangedはブラウザによって複数回発火することがあるため、
      // setStateの関数形で常に最新のselectedを参照する(クロージャの古い値で
      // ユーザーが選び直した声を上書きしてしまわないようにする)。
      setSelected((prevSelected) => {
        if (prevSelected && list.some((v) => v.voiceURI === prevSelected)) {
          return prevSelected;
        }
        const saved = getSavedVoiceURI();
        if (saved && list.some((v) => v.voiceURI === saved)) {
          return saved;
        }
        const ja = list.find((v) => v.lang?.toLowerCase().startsWith("ja"));
        return ja ? ja.voiceURI : prevSelected;
      });
    }
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(voiceURI: string) {
    setSelected(voiceURI);
    saveVoiceURI(voiceURI || null);
  }

  function handleTest() {
    speakText("こんにちは。この声でAIの回答を読み上げます。");
  }

  if (!supported) {
    return (
      <p className="text-xs text-ink/50">
        お使いのブラウザは音声読み上げに対応していません。
      </p>
    );
  }

  const japaneseVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith("ja"));
  const otherVoices = voices.filter((v) => !v.lang?.toLowerCase().startsWith("ja"));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink/50">
        「AIと会話する」でAIの返事を読み上げる際に使う声を選べます。この端末だけの設定です。
      </p>
      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
      >
        {voices.length === 0 && <option value="">読み込み中…</option>}
        {japaneseVoices.length > 0 && (
          <optgroup label="日本語">
            {japaneseVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
              </option>
            ))}
          </optgroup>
        )}
        {otherVoices.length > 0 && (
          <optgroup label="その他の言語">
            {otherVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}({v.lang})
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <button
        type="button"
        onClick={handleTest}
        disabled={!selected}
        className="self-start rounded-full border border-green-600 px-4 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-50 disabled:opacity-50"
      >
        試しに読み上げる
      </button>
    </div>
  );
}

