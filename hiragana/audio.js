import { useEffect, useRef } from "react";

// Speak a card aloud. Returns speak(card): it prefers the card's pre-recorded
// audio/{romaji}.m4a and falls back to on-device TTS of the kana reading when there
// is no recording (numbers, words, extended kana). The ja voice is resolved async
// (it may not be ready at first paint — voiceschanged fires later) and Audio objects
// are pooled so a replay doesn't re-fetch the file.
export function useAudio() {
  const jaVoiceRef = useRef(null);
  const audioPool = useRef(new Map());

  useEffect(() => {
    function findJaVoice() {
      const voices = window.speechSynthesis?.getVoices() || [];
      const v = voices.find(v => v.lang === "ja-JP" || v.lang.startsWith("ja"));
      if (v) jaVoiceRef.current = v;
    }
    findJaVoice();
    window.speechSynthesis?.addEventListener("voiceschanged", findJaVoice);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", findJaVoice);
  }, []);

  function speakViaTTS(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ja-JP";
    utter.rate = 0.35;
    if (jaVoiceRef.current) utter.voice = jaVoiceRef.current;
    window.speechSynthesis.speak(utter);
  }

  function speak(card) {
    if (!card) return;
    // No pre-recorded file (numbers, words) → speak the kana reading via TTS.
    if (!card.audioKey) { speakViaTTS(card.reading ?? card.front); return; }
    let audio = audioPool.current.get(card.audioKey);
    if (!audio) {
      audio = new Audio(`./audio/${card.audioKey}.m4a`);
      audioPool.current.set(card.audioKey, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(() => speakViaTTS(card.reading ?? card.front));
  }

  return speak;
}
