/**
 * TimeNation Chrono Sounds — synthetic audio for the messenger.
 * Web: Web Audio API (OscillatorNode + GainNode, no files needed).
 * Native: expo-av + expo-file-system (generates WAV, caches to disk).
 */
import { Platform } from "react-native";

// ── WAV generator (pure math, works in both RN JS engine and browser) ─────────
function genWavBase64(
  freqHz: number,
  durationMs: number,
  volume = 0.28,
  decayRate = 10,
  freqHz2?: number,
): string {
  const sampleRate = 22050;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const buf = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buf);

  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM format
  view.setUint16(22, 1, true);          // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, numSamples * 2, true);

  const tau = 2 * Math.PI;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-decayRate * t);
    let s = Math.sin(tau * freqHz * t);
    if (freqHz2) s = 0.5 * s + 0.5 * Math.sin(tau * freqHz2 * t);
    view.setInt16(44 + i * 2, Math.round(s * volume * env * 32767), true);
  }

  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    );
  }
  return "data:audio/wav;base64," + btoa(binary);
}

const TONES: Record<string, () => string> = {
  send:    () => genWavBase64(880, 130, 0.22, 18),
  receive: () => genWavBase64(528, 220, 0.18, 6),
  tip:     () => genWavBase64(660, 260, 0.25, 7, 880),
};

// ── Native playback via expo-av + expo-file-system ────────────────────────────

type FsModule = {
  cacheDirectory: string | null;
  getInfoAsync: (path: string) => Promise<{ exists: boolean }>;
  writeAsStringAsync: (path: string, data: string, opts: { encoding: string }) => Promise<void>;
  EncodingType: { Base64: string };
};

async function playNative(key: string): Promise<void> {
  try {
    const [{ Audio }, fsRaw] = await Promise.all([
      import("expo-av"),
      import("expo-file-system"),
    ]);
    const FS = fsRaw as unknown as FsModule;
    const cacheFile = (FS.cacheDirectory ?? "") + `tn_sfx_${key}.wav`;
    const info = await FS.getInfoAsync(cacheFile);
    if (!info.exists) {
      const b64 = (TONES[key]?.() ?? "").replace("data:audio/wav;base64,", "");
      await FS.writeAsStringAsync(cacheFile, b64, {
        encoding: FS.EncodingType.Base64,
      });
    }
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri: cacheFile },
      { shouldPlay: true, volume: 0.55 },
    );
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) sound.unloadAsync().catch(() => {});
    });
  } catch { /* sound is non-critical */ }
}

// ── Web playback via AudioContext ─────────────────────────────────────────────
function playWeb(
  freq: number,
  durationMs: number,
  vol = 0.12,
  decay = 12,
  freq2?: number,
  delay2Ms = 0,
): void {
  try {
    type WinWK = { webkitAudioContext?: typeof AudioContext };
    const AC =
      window.AudioContext ?? (window as unknown as WinWK).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const playOsc = (f: number, startSec: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = f;
      osc.type = "sine";
      gain.gain.setValueAtTime(vol, startSec);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        startSec + durationMs / 1000,
      );
      osc.start(startSec);
      osc.stop(startSec + durationMs / 1000);
    };
    playOsc(freq, ctx.currentTime);
    if (freq2) playOsc(freq2, ctx.currentTime + delay2Ms / 1000);
    setTimeout(
      () => ctx.close().catch(() => {}),
      durationMs + delay2Ms + 300,
    );
  } catch { /* ignore */ }
}

// ── Public API ────────────────────────────────────────────────────────────────
export const ChronoSounds = {
  playSend() {
    if (Platform.OS === "web") playWeb(880, 110, 0.11, 20);
    else void playNative("send");
  },
  playReceive() {
    if (Platform.OS === "web") playWeb(528, 200, 0.09, 7);
    else void playNative("receive");
  },
  playTip() {
    if (Platform.OS === "web") playWeb(660, 160, 0.13, 8, 880, 130);
    else void playNative("tip");
  },
};
