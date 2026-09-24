"use client";

import { useEffect, useState } from "react";
import {
  getSavedVoiceURI,
  saveVoiceURI,
  getVoiceMode,
  saveVoiceMode,
  speakTextSmart,
  type VoiceMode,
} from "@/lib/voicePreference";
import { CustomVoiceRecorder } from "@/components/CustomVoiceRecorder";

// 「AIと会話する」機能の読み上げ(TTS)で使う声を選ぶ設定画面。
// ブラウザ標準のWeb Speech API(speechSynthesis)の声一覧から選ぶ方法に加えて、
// 自分の声を録音して作ったAIクローン音声(CustomVoiceRecorder)も選べる。
// 選んだ声・モードはこの端末のlocalStorageに保存される(サーバーには送信しない)。
export function VoiceSettings() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [supported, setSupported] = useState(true);
  const [mode, setMode] = useState<VoiceMode>("browser");
  const [customReady, setCustomReady] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setMode(getVoiceMode());

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

  function handleModeChange(next: VoiceMode) {
    setMode(next);
    saveVoiceMode(next);
  }

  async function handleTest() {
    setTesting(true);
    try {
      await speakTextSmart("こんにちは。この声でAIの回答を読み上げます。");
    } finally {
      setTesting(false);
    }
  }

  const japaneseVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith("ja"));
  const otherVoices = voices.filter((v) => !v.lang?.toLowerCase().startsWith("ja"));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-ink/50">
        「AIと会話する」でAIの返事を読み上げる際に使う声を選べます。
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input
            type="radio"
            name="voice-mode"
            checked={mode === "browser"}
            onChange={() => handleModeChange("browser")}
          />
          端末標準の音声を使う
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input
            type="radio"
            name="voice-mode"
            checked={mode === "custom"}
            onChange={() => handleModeChange("custom")}
            disabled={!customReady}
          />
          自分の声(AIクローン)を使う{!customReady && "(未登録)"}
        </label>
      </div>

      {mode === "browser" && supported && (
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
      )}
      {mode === "browser" && !supported && (
        <p className="text-xs text-ink/50">
          お使いのブラウザは音声読み上げに対応していません。
        </p>
      )}

      <button
        type="button"
        onClick={handleTest}
        disabled={testing || (mode === "browser" && (!supported || !selected))}
        className="self-start rounded-full border border-green-600 px-4 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-50 disabled:opacity-50"
      >
        {testing ? "再生中…" : "試しに読み上げる"}
      </button>

      <CustomVoiceRecorder onReady={() => setCustomReady(true)} />
    </div>
  );
}
