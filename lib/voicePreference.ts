// AIの回答読み上げ(音声合成)で使う声の好みを、ブラウザのlocalStorageに保存する。
// サーバー側のデータではなく、端末ごとの表示設定に近いため、DBマイグレーションを
// 追加せずにlocalStorageで管理する。
const STORAGE_KEY = "kioku_voice_uri";

export function getSavedVoiceURI(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveVoiceURI(voiceURI: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (voiceURI) {
      window.localStorage.setItem(STORAGE_KEY, voiceURI);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorageが使えない環境では何もしない
  }
}

export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const savedURI = getSavedVoiceURI();
  if (savedURI) {
    const saved = voices.find((v) => v.voiceURI === savedURI);
    if (saved) return saved;
  }
  const japanese = voices.find((v) => v.lang?.toLowerCase().startsWith("ja"));
  return japanese ?? voices[0];
}

export function speakText(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const voice = pickVoice(voices);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "ja-JP";
  }
  window.speechSynthesis.speak(utterance);
}

// 読み上げに「端末標準の音声(ブラウザTTS)」を使うか、「自分の声(AIクローン)」を
// 使うかの好み。voiceURIと同じくこの端末のlocalStorageのみに保存する。
const MODE_STORAGE_KEY = "kioku_voice_mode";
export type VoiceMode = "browser" | "custom";

export function getVoiceMode(): VoiceMode {
  if (typeof window === "undefined") return "browser";
  try {
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    return saved === "custom" ? "custom" : "browser";
  } catch {
    return "browser";
  }
}

export function saveVoiceMode(mode: VoiceMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // localStorageが使えない環境では何もしない
  }
}

/**
 * 読み上げの好み設定(ブラウザ標準 / 自分の声)に応じてテキストを読み上げる。
 * カスタム音声モードの場合はサーバーアクション経由で音声合成し<audio>で再生する。
 * 生成に失敗した場合(未設定・API未設定・通信エラー等)はブラウザ標準の読み上げに
 * フォールバックする。
 */
export async function speakTextSmart(text: string): Promise<void> {
  if (getVoiceMode() === "custom") {
    try {
      const { synthesizeWithCustomVoice } = await import("@/app/actions/voice");
      const result = await synthesizeWithCustomVoice(text);
      if (result.ok) {
        const audio = new Audio(`data:audio/mpeg;base64,${result.audioBase64}`);
        await audio.play().catch(() => {
          // 自動再生がブロックされた場合など。ブラウザ標準の読み上げにはフォールバックしない
          // (ユーザー操作起点の呼び出しであれば通常ブロックされない)。
        });
        return;
      }
    } catch {
      // フォールバックへ
    }
  }
  speakText(text);
}

