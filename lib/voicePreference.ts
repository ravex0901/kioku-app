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

